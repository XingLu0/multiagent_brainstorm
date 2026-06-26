import { prisma } from "@/lib/prisma";
import { getExpertById } from "@/lib/experts/definitions";
import { HostAgent, type EngineCallbacks, type HostGuideResult } from "./host-agent";
import { ExpertAgent } from "./expert-agent";
import { DocumentAgent, type DocumentType } from "./document-agent";
import { createEngineTools } from "./tools";
import type { LanguageModel } from "ai";

const MAX_CONTEXT_ROUNDS = 20;
const AUTO_SUMMARY_INTERVAL = 4;
const MAX_EXPERT_ROUNDS = 5;
const PAUSE_AFTER_EXPERT_TURNS = 5;

interface ConversationMessage {
  role: string;
  content: string;
}

export class BrainstormEngine {
  private hostAgent: HostAgent;
  private expertAgent: ExpertAgent;
  private documentAgent: DocumentAgent;

  constructor(
    model: LanguageModel,
    llmConfig: { maxTokens: number; temperature: number },
    searchApiKey: string
  ) {
    const tools = createEngineTools({ searchApiKey });
    this.hostAgent = new HostAgent(model, llmConfig, tools);
    this.expertAgent = new ExpertAgent(model, llmConfig, tools);
    this.documentAgent = new DocumentAgent(model, llmConfig);
  }

  /**
   * 计算项目下一条消息的 seq 值（SQLite 不支持非主键 autoincrement）
   */
  private async getNextSeq(projectId: string): Promise<number> {
    const result = await prisma.message.aggregate({
      where: { projectId },
      _max: { seq: true },
    });
    return (result._max.seq ?? 0) + 1;
  }

  /**
   * 处理用户消息：持久化 → 检查自动总结 → 主持人引导 → 专家轮次对话 → 持久化
   */
  async handleUserMessage(
    projectId: string,
    content: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active")
      throw new Error("该项目已结束，无法继续对话");

    const expertIds = JSON.parse(project.expertIds) as string[];

    // 1. 持久化用户消息
    await prisma.message.create({
      data: {
        projectId,
        role: "user",
        content,
        seq: await this.getNextSeq(projectId),
      },
    });

    // 2. 更新轮次计数（延后到主持人引导成功后，避免失败时占用总结轮次）
    const newTurnCount = project.turnCount + 1;

    // 3. 加载对话历史
    const history = await this.loadConversationHistory(projectId);
    const contextString = await this.buildContextString(history);

    // 4. 主持人引导（使用 holder 避免 TDZ：流式期间 guideResult 尚未赋值）
    let designatedExpertIds: string[] | undefined;
    const guideResult = await this.hostAgent.guide(
      content,
      expertIds,
      history.slice(-MAX_CONTEXT_ROUNDS),
      (chunk) => {
        callbacks.onHost?.(chunk, designatedExpertIds);
      },
      abortSignal,
      (toolName, input) => callbacks.onToolCall?.(null, toolName, input)
    );
    designatedExpertIds = guideResult.designatedExpertIds;

    // 主持人引导成功后才更新轮次计数
    await prisma.project.update({
      where: { id: projectId },
      data: { turnCount: newTurnCount },
    });

    // 持久化主持人消息
    await prisma.message.create({
      data: {
        projectId,
        role: "host",
        content: guideResult.guidance,
        metadata: JSON.stringify({ designatedExpertIds: guideResult.designatedExpertIds }),
        seq: await this.getNextSeq(projectId),
      },
    });

    // 5. 检查是否需要自动总结（引导之后执行，确保总结包含主持人引导内容）
    if (newTurnCount % AUTO_SUMMARY_INTERVAL === 0) {
      const refreshedHistory = await this.loadConversationHistory(projectId);
      const refreshedContext = await this.buildContextString(refreshedHistory);

      const summary = await this.hostAgent.generateSummary(
        refreshedContext,
        (chunk) => callbacks.onSummary?.(chunk),
        abortSignal
      );

      await prisma.message.create({
        data: {
          projectId,
          role: "summary",
          content: summary,
          seq: await this.getNextSeq(projectId),
        },
      });
    }

    // 6. 专家轮次对话
    await this.runExpertDiscussion(
      projectId,
      guideResult,
      content,
      contextString,
      callbacks,
      abortSignal
    );
  }

  /**
   * 编辑用户消息后重建对话：删除后续消息 → 更新内容 → 重新生成
   */
  async handleEditedMessage(
    projectId: string,
    messageId: string,
    newContent: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active")
      throw new Error("该项目已结束，无法继续对话");

    // 1. 获取目标消息
    const targetMessage = await prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!targetMessage) throw new Error("消息不存在");
    if (targetMessage.role !== "user") throw new Error("只能编辑用户消息");
    if (targetMessage.projectId !== projectId) {
      throw new Error("消息不属于该项目");
    }

    // 2. 删除该消息之后的所有消息
    await prisma.message.deleteMany({
      where: {
        projectId,
        seq: { gt: targetMessage.seq },
      },
    });

    // 3. 更新目标消息内容
    await prisma.message.update({
      where: { id: messageId },
      data: { content: newContent },
    });

    // 4. 重新加载历史（已截断到编辑点）
    const history = await this.loadConversationHistory(projectId);
    const contextString = await this.buildContextString(history);
    const expertIds = JSON.parse(project.expertIds) as string[];

    // 5. 主持人引导（不递增轮次，这是编辑不是新轮次）
    let designatedExpertIds: string[] | undefined;
    const guideResult = await this.hostAgent.guide(
      newContent,
      expertIds,
      history.slice(-MAX_CONTEXT_ROUNDS),
      (chunk) => {
        callbacks.onHost?.(chunk, designatedExpertIds);
      },
      abortSignal,
      (toolName, input) => callbacks.onToolCall?.(null, toolName, input)
    );
    designatedExpertIds = guideResult.designatedExpertIds;

    // 持久化主持人消息
    await prisma.message.create({
      data: {
        projectId,
        role: "host",
        content: guideResult.guidance,
        metadata: JSON.stringify({ designatedExpertIds: guideResult.designatedExpertIds }),
        seq: await this.getNextSeq(projectId),
      },
    });

    // 6. 专家轮次对话
    await this.runExpertDiscussion(
      projectId,
      guideResult,
      newContent,
      contextString,
      callbacks,
      abortSignal
    );
  }

  /**
   * 专家轮次对话：多位专家交叉讨论，用户可随时打断
   * 支持 resumeState 从暂停点恢复
   */
  private async runExpertDiscussion(
    projectId: string,
    guideResult: HostGuideResult,
    userMessage: string,
    contextString: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal,
    resumeState?: {
      startRound: number;
      startIndex: number;
      completedTurns: number;
    }
  ): Promise<void> {
    const activeExpertIds = guideResult.designatedExpertIds;
    let turnContext = contextString;

    const startRound = resumeState?.startRound ?? 0;
    const startIndex = resumeState?.startIndex ?? 0;
    let turnCount = resumeState?.completedTurns ?? 0;
    const pauseBase = resumeState?.completedTurns ?? 0;
    const totalTurns = MAX_EXPERT_ROUNDS * activeExpertIds.length;

    for (let round = startRound; round < MAX_EXPERT_ROUNDS; round++) {
      const startI = round === startRound ? startIndex : 0;
      for (let i = startI; i < activeExpertIds.length; i++) {
        const expertId = activeExpertIds[i];
        const isLastOverall =
          round === MAX_EXPERT_ROUNDS - 1 &&
          i === activeExpertIds.length - 1;

        // 检查打断
        if (abortSignal?.aborted) return;

        // 通知前端即将发言的专家（提前切换气泡颜色）
        callbacks.onExpertStart?.(expertId, round);

        // 收集当前专家的搜索结果
        const expertSearchResults: string[] = [];

        // 专家发言
        const expertResponse = await this.expertAgent.respond(
          expertId,
          guideResult.guidance,
          userMessage,
          turnContext,
          (chunk) => callbacks.onExpert?.(chunk, expertId, round),
          abortSignal,
          isLastOverall, // 最后一位专家需要 [HOOK] 结尾
          // onToolCall — 转发到前端
          (toolName, input) => callbacks.onToolCall?.(expertId, toolName, input),
          // onToolResult — 收集搜索结果供后续专家参考
          (toolName, input, output) => {
            if (toolName === "webSearch") {
              const queries = typeof input === "object" && input !== null
                ? (input as { queries?: string[] }).queries ?? []
                : [];
              const queryLabel = queries.length > 0 ? queries.join(" / ") : "未知关键词";
              const results = typeof output === "object" && output !== null
                ? (output as { results?: string }).results ?? ""
                : String(output);
              if (results) {
                expertSearchResults.push(`搜索"${queryLabel}"的结果：\n${results}`);
              }
            }
          }
        );

        // 持久化专家消息
        await prisma.message.create({
          data: {
            projectId,
            role: `expert:${expertId}`,
            content: expertResponse,
            metadata: JSON.stringify({ expertId, round }),
            seq: await this.getNextSeq(projectId),
          },
        });

        // 追加搜索结果到上下文（供下一位专家参考）
        const expert = await getExpertById(expertId);
        if (expertSearchResults.length > 0) {
          turnContext += `\n\n[${expert?.name ?? "专家"}的搜索发现]：\n${expertSearchResults.join("\n\n")}`;
        }
        turnContext += `\n\n[${expert?.name ?? "专家"}]：${expertResponse}`;

        turnCount++;

        // 检查打断
        if (abortSignal?.aborted) return;

        // 暂停检测：达到阈值且还有剩余轮次
        if (
          turnCount - pauseBase >= PAUSE_AFTER_EXPERT_TURNS &&
          turnCount < totalTurns
        ) {
          const pauseSummary = await this.hostAgent.generateMidDiscussionSummary(
            turnContext,
            (chunk) => callbacks.onPause?.(chunk, totalTurns - turnCount),
            abortSignal
          );

          // 持久化暂停总结，包含恢复所需的元数据
          await prisma.message.create({
            data: {
              projectId,
              role: "pause",
              content: pauseSummary,
              metadata: JSON.stringify({
                type: "pause",
                guideResult,
                userMessage,
                completedTurns: turnCount,
                totalTurns,
                startRound: round,
                startIndex: i + 1,
                activeExpertIds,
              }),
              seq: await this.getNextSeq(projectId),
            },
          });

          return; // 暂停：流结束
        }
      }
      if (abortSignal?.aborted) return;
    }
  }

  /**
   * 继续被暂停的专家讨论
   * 加载历史 → 查找暂停点 → 可选持久化用户补充输入 → 继续剩余专家轮次
   */
  async handleContinueDiscussion(
    projectId: string,
    userInput: string | null,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active")
      throw new Error("该项目已结束，无法继续对话");

    // 1. 查找最后一条暂停消息
    const pauseMessage = await prisma.message.findFirst({
      where: { projectId, role: "pause" },
      orderBy: { seq: "desc" },
    });
    if (!pauseMessage) throw new Error("未找到暂停点，无法继续讨论");

    // 2. 防止重复继续
    const expertCountAfterPause = await prisma.message.count({
      where: {
        projectId,
        seq: { gt: pauseMessage.seq },
        role: { startsWith: "expert:" },
      },
    });
    if (expertCountAfterPause > 0) {
      throw new Error("该暂停点的讨论已继续，无需重复操作");
    }

    // 3. 解析暂停元数据
    const pauseMeta = JSON.parse(pauseMessage.metadata!) as {
      guideResult: HostGuideResult;
      userMessage: string;
      completedTurns: number;
      totalTurns: number;
      startRound: number;
      startIndex: number;
      activeExpertIds: string[];
    };

    // 4. 可选：持久化用户补充输入
    if (userInput && userInput.trim()) {
      await prisma.message.create({
        data: {
          projectId,
          role: "user",
          content: userInput.trim(),
          seq: await this.getNextSeq(projectId),
        },
      });
    }

    // 5. 重新加载对话历史（含暂停总结 + 可选用户输入）
    const history = await this.loadConversationHistory(projectId);
    const contextString = await this.buildContextString(history);

    // 6. 继续剩余专家讨论
    await this.runExpertDiscussion(
      projectId,
      pauseMeta.guideResult,
      pauseMeta.userMessage,
      contextString,
      callbacks,
      abortSignal,
      {
        startRound: pauseMeta.startRound,
        startIndex: pauseMeta.startIndex,
        completedTurns: pauseMeta.completedTurns,
      }
    );
  }

  /**
   * 生成阶段总结（手动触发）
   */
  async generateSummary(
    projectId: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const history = await this.loadConversationHistory(projectId);
    const contextString = await this.buildContextString(history);

    const summary = await this.hostAgent.generateSummary(
      contextString,
      (chunk) => callbacks.onSummary?.(chunk),
      abortSignal
    );

    await prisma.message.create({
      data: {
        projectId,
        role: "summary",
        content: summary,
        seq: await this.getNextSeq(projectId),
      },
    });
  }

  /**
   * 结束脑暴，生成会议纪要
   */
  async generateMinutes(
    projectId: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") {
      throw new Error("该项目已结束，无法重复生成纪要");
    }

    const history = await this.loadConversationHistory(projectId);
    const contextString = await this.buildContextString(history);

    const minutes = await this.hostAgent.generateMinutes(
      project.title,
      contextString,
      (chunk) => callbacks.onMinutes?.(chunk),
      abortSignal
    );

    // 保存纪要
    await prisma.generatedDocument.create({
      data: {
        projectId,
        docType: "minutes",
        content: minutes,
      },
    });

    // 更新项目状态
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });
  }

  /**
   * 生成文档草稿（PRD/SPEC）
   */
  async generateDocument(
    projectId: string,
    docType: DocumentType,
    content: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const doc = await this.documentAgent.generate(docType, content, (chunk) => {
      callbacks.onDocument?.(chunk);
    }, abortSignal);

    // 保存文档
    await prisma.generatedDocument.create({
      data: {
        projectId,
        docType,
        content: doc,
      },
    });
  }

  /**
   * 加载对话历史（按 seq 排序，保证严格顺序）
   */
  private async loadConversationHistory(
    projectId: string
  ): Promise<ConversationMessage[]> {
    const messages = await prisma.message.findMany({
      where: { projectId },
      orderBy: { seq: "asc" },
    });

    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * 构建上下文字符串
   */
  private async buildContextString(history: ConversationMessage[]): Promise<string> {
    // 保留最近20轮完整对话
    const recentMessages = history.slice(-MAX_CONTEXT_ROUNDS * 3);

    const lines: string[] = [];
    for (const m of recentMessages) {
      const roleLabel = await this.getRoleLabel(m.role);
      lines.push(`[${roleLabel}]：${m.content}`);
    }
    return lines.join("\n\n");
  }

  /**
   * 获取角色显示名称
   */
  private async getRoleLabel(role: string): Promise<string> {
    if (role === "user") return "用户";
    if (role === "host") return "主持人";
    if (role === "summary") return "阶段总结";
    if (role === "pause") return "中场总结";
    if (role.startsWith("expert:")) {
      const expertId = role.slice(7);
      const expert = await getExpertById(expertId);
      return expert?.name ?? "专家";
    }
    return role;
  }
}
