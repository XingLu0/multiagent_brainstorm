import { prisma } from "@/lib/prisma";
import { getExpertById } from "@/lib/experts/definitions";
import { HostAgent, type EngineCallbacks, type HostGuideResult } from "./host-agent";
import { ExpertAgent } from "./expert-agent";
import { DocumentAgent, type DocumentType } from "./document-agent";
import { MindmapAgent } from "./mindmap-agent";
import { createEngineTools } from "./tools";
import { queryKnowledge, extractAndSaveKnowledge } from "./knowledge-base";
import type { LanguageModel } from "ai";

const MAX_CONTEXT_ROUNDS = 20;
const AUTO_SUMMARY_INTERVAL = 4;
const MAX_EXPERT_ROUNDS = 5;
const PAUSE_AFTER_EXPERT_TURNS = 5;

interface ConversationMessage {
  role: string;
  content: string;
}

/** 用户上传的附件（前端解析后的文件内容） */
export interface MessageAttachment {
  name: string;
  type: string;
  text: string;
}

export class BrainstormEngine {
  private model: LanguageModel;
  private hostAgent: HostAgent;
  private expertAgent: ExpertAgent;
  private documentAgent: DocumentAgent;
  private mindmapAgent: MindmapAgent;

  constructor(
    model: LanguageModel,
    llmConfig: { maxTokens: number; temperature: number },
    searchApiKey: string
  ) {
    this.model = model;
    const tools = createEngineTools({ searchApiKey });
    this.hostAgent = new HostAgent(model, llmConfig, tools);
    this.expertAgent = new ExpertAgent(model, llmConfig, tools);
    this.documentAgent = new DocumentAgent(model, llmConfig);
    this.mindmapAgent = new MindmapAgent(model);
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
   * 读取并消费未使用的用户干预指令。
   *
   * 扫描项目中所有 role=user 的消息，解析 metadata，筛选出
   * type="intervene" 且尚未被消费（consumed !== true）的干预指令。
   * 读取后立即将其 metadata 标记为 consumed=true（持久化），
   * 确保每条干预指令仅在一个专家讨论轮次中被强调注入。
   *
   * @returns 未消费的干预指令原文列表（按 seq 升序）
   */
  private async consumeUnconsumedInterventions(
    projectId: string
  ): Promise<string[]> {
    const messages = await prisma.message.findMany({
      where: { projectId, role: "user" },
      orderBy: { seq: "asc" },
      select: { id: true, content: true, metadata: true },
    });

    const directives: string[] = [];
    const toMark: { id: string; metadata: string }[] = [];

    for (const m of messages) {
      if (!m.metadata) continue;
      try {
        const meta = JSON.parse(m.metadata) as {
          type?: string;
          consumed?: boolean;
        };
        if (meta.type === "intervene" && meta.consumed !== true) {
          directives.push(m.content);
          toMark.push({
            id: m.id,
            metadata: JSON.stringify({ ...meta, consumed: true }),
          });
        }
      } catch {
        // 元数据解析失败，跳过该条消息
      }
    }

    // 标记为已消费，避免重复强调
    for (const item of toMark) {
      await prisma.message.update({
        where: { id: item.id },
        data: { metadata: item.metadata },
      });
    }

    return directives;
  }

  /**
   * 处理用户消息：持久化 → 检查自动总结 → 主持人引导 → 专家轮次对话 → 持久化
   *
   * @param attachments 用户上传的附件列表（前端解析后的文本内容），可选
   */
  async handleUserMessage(
    projectId: string,
    content: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal,
    attachments?: MessageAttachment[]
  ): Promise<void> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active")
      throw new Error("该项目已结束，无法继续对话");

    const expertIds = JSON.parse(project.expertIds) as string[];

    // 1. 持久化用户消息（附件摘要写入 metadata）
    const userMetadata =
      attachments && attachments.length > 0
        ? JSON.stringify({
            attachments: attachments.map((a) => ({
              name: a.name,
              type: a.type,
              length: a.text.length,
            })),
          })
        : undefined;
    await prisma.message.create({
      data: {
        projectId,
        role: "user",
        content,
        metadata: userMetadata,
        seq: await this.getNextSeq(projectId),
      },
    });

    // 2. 更新轮次计数（延后到主持人引导成功后，避免失败时占用总结轮次）
    const newTurnCount = project.turnCount + 1;

    // 3. 加载对话历史，并注入附件内容到上下文
    const history = await this.loadConversationHistory(projectId);
    const contextString = await this.buildContextString(history, projectId, attachments);

    // 4. 主持人引导（使用 holder 对象避免 TDZ：流式期间 guideResult 尚未赋值）
    const designatedExpertIdsHolder: { current: string[] | undefined } = { current: undefined };
    const guideResult = await this.hostAgent.guide(
      content,
      expertIds,
      history.slice(-MAX_CONTEXT_ROUNDS),
      (chunk) => {
        callbacks.onHost?.(chunk, designatedExpertIdsHolder.current);
      },
      abortSignal,
      (toolName, input) => callbacks.onToolCall?.(null, toolName, input),
      (project.phase || "diverge") as "diverge" | "converge"
    );
    designatedExpertIdsHolder.current = guideResult.designatedExpertIds;

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
      const refreshedContext = await this.buildContextString(refreshedHistory, projectId);

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
      abortSignal,
      undefined,
      (project.phase || "diverge") as "diverge" | "converge"
    );
  }

  /**
   * 处理用户干预指令：将以 / 开头的方向性干预持久化为干预类型消息。
   *
   * 与 handleUserMessage 不同，此方法不触发主持人引导与专家讨论流程，
   * 仅持久化指令；该指令将在下一轮 runExpertDiscussion 时以
   * 【用户干预指令】段落注入专家上下文，引导专家优先回应用户指定方向。
   *
   * @param directive 用户输入的干预指令原文（如 "/focus 成本控制"）
   */
  async handleIntervene(
    projectId: string,
    directive: string,
    abortSignal?: AbortSignal
  ): Promise<void> {
    // 若请求已被取消，直接返回
    if (abortSignal?.aborted) return;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") {
      throw new Error("该项目已结束，无法继续对话");
    }

    // 持久化干预指令：role=user，metadata 标记 type=intervene
    await prisma.message.create({
      data: {
        projectId,
        role: "user",
        content: directive,
        metadata: JSON.stringify({ type: "intervene" }),
        seq: await this.getNextSeq(projectId),
      },
    });

    // 不触发专家讨论流程，仅持久化供下一轮讨论使用
  }

  /**
   * 处理动态专家变更：邀请新专家或移除已有专家
   *
   * 校验规则：
   * - 仅前 3 轮（turnCount < 3）允许变更
   * - 每轮最多 1 次变更
   * - 移除时至少保留 1 位专家
   *
   * 变更后创建 system 消息记录，返回更新后的 expertIds
   */
  async handleExpertChange(
    projectId: string,
    action: "add" | "remove",
    expertId: string
  ): Promise<string[]> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active")
      throw new Error("该项目已结束，无法修改专家");

    const expertIds = JSON.parse(project.expertIds) as string[];

    // 校验轮次限制（前 3 轮才允许，最后两轮不允许）
    if (project.turnCount >= 3) {
      throw new Error("已进入最后两轮讨论，不允许修改专家阵容");
    }

    // 校验每轮 1 次变更：查询最近一条 expert_change 消息，比较其记录的轮次
    const existingChange = await prisma.message.findFirst({
      where: {
        projectId,
        role: "system",
        metadata: { contains: '"type":"expert_change"' },
      },
      orderBy: { seq: "desc" },
    });
    if (existingChange && existingChange.metadata) {
      try {
        const meta = JSON.parse(existingChange.metadata) as {
          type?: string;
          turnCount?: number;
        };
        if (meta.type === "expert_change" && meta.turnCount === project.turnCount) {
          throw new Error("本轮已修改过专家阵容，每轮仅允许一次变更");
        }
      } catch (e) {
        // 重新抛出业务校验错误，避免被吞掉
        if (e instanceof Error && e.message.includes("本轮")) throw e;
        // metadata 解析失败，允许变更
      }
    }

    // 校验 expertId 存在
    const expert = await getExpertById(expertId);
    if (!expert) throw new Error("专家不存在");

    // 校验 action 并执行变更
    if (action === "add") {
      if (expertIds.includes(expertId))
        throw new Error("该专家已在讨论中");
      expertIds.push(expertId);
    } else if (action === "remove") {
      if (!expertIds.includes(expertId))
        throw new Error("该专家不在当前讨论中");
      if (expertIds.length <= 1)
        throw new Error("至少需要保留一位专家");
      const idx = expertIds.indexOf(expertId);
      expertIds.splice(idx, 1);
    } else {
      throw new Error("无效的操作类型");
    }

    // 更新 Project.expertIds
    await prisma.project.update({
      where: { id: projectId },
      data: { expertIds: JSON.stringify(expertIds) },
    });

    // 创建 system 消息记录变更
    await prisma.message.create({
      data: {
        projectId,
        role: "system",
        content:
          action === "add"
            ? `已邀请「${expert.name}」加入讨论`
            : `已将「${expert.name}」移出讨论`,
        metadata: JSON.stringify({
          type: "expert_change",
          action,
          expertId,
          expertName: expert.name,
          turnCount: project.turnCount,
        }),
        seq: await this.getNextSeq(projectId),
      },
    });

    return expertIds;
  }

  /**
   * 处理阶段切换：发散 → 收敛
   * 创建 system 消息记录阶段变更
   */
  async handlePhaseTransition(
    projectId: string,
    newPhase: "converge"
  ): Promise<void> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") throw new Error("该项目已结束，无法切换阶段");
    if (project.phase === newPhase) throw new Error(`当前已处于${newPhase === "converge" ? "收敛" : "发散"}阶段`);
    if (project.phase === "concluded") throw new Error("项目已结束，无法切换阶段");

    const oldPhase = project.phase;
    await prisma.project.update({
      where: { id: projectId },
      data: { phase: newPhase },
    });

    await prisma.message.create({
      data: {
        projectId,
        role: "system",
        content: newPhase === "converge" ? "讨论已进入收敛阶段，专家将聚焦方案评估与取舍" : "讨论已进入发散阶段",
        metadata: JSON.stringify({ type: "phase_change", from: oldPhase, to: newPhase }),
        seq: await this.getNextSeq(projectId),
      },
    });
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
    const contextString = await this.buildContextString(history, projectId);
    const expertIds = JSON.parse(project.expertIds) as string[];

    // 5. 主持人引导（使用 holder 对象避免 TDZ：流式期间 guideResult 尚未赋值）
    const designatedExpertIdsHolder: { current: string[] | undefined } = { current: undefined };
    const guideResult = await this.hostAgent.guide(
      newContent,
      expertIds,
      history.slice(-MAX_CONTEXT_ROUNDS),
      (chunk) => {
        callbacks.onHost?.(chunk, designatedExpertIdsHolder.current);
      },
      abortSignal,
      (toolName, input) => callbacks.onToolCall?.(null, toolName, input),
      (project.phase || "diverge") as "diverge" | "converge"
    );
    designatedExpertIdsHolder.current = guideResult.designatedExpertIds;

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
      abortSignal,
      undefined,
      (project.phase || "diverge") as "diverge" | "converge"
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
    },
    phase: "diverge" | "converge" = "diverge"
  ): Promise<void> {
    const activeExpertIds = guideResult.designatedExpertIds;
    let turnContext = contextString;

    // 注入未消费的用户干预指令：以【用户干预指令】段落追加到上下文末尾，
    // 配合 expert-system 提示词，引导专家优先围绕用户指定方向展开讨论。
    // 注入后立即标记为已消费，避免在后续讨论（如暂停恢复）中重复强调。
    const interventions = await this.consumeUnconsumedInterventions(projectId);
    if (interventions.length > 0) {
      turnContext += `\n\n【用户干预指令】\n${interventions
        .map((d) => `- ${d}`)
        .join("\n")}`;
    }

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
          },
          phase
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

      // 每轮结束后异步提取知识条目存入共享知识库（不阻塞流式输出，错误静默处理）
      try {
        await extractAndSaveKnowledge(
          this.model,
          projectId,
          turnContext,
          abortSignal
        );
      } catch {
        // 知识提取失败不影响讨论流程
      }
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
    const contextString = await this.buildContextString(history, projectId);

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
      },
      (project.phase || "diverge") as "diverge" | "converge"
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
    const contextString = await this.buildContextString(history, projectId);

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
    const contextString = await this.buildContextString(history, projectId);

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
        phase: "concluded",
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
   * 生成思维导图：基于会议纪要流式输出 Markdown 格式的思维导图
   */
  async generateMindmap(
    projectId: string,
    callbacks: { onMindmap?: (chunk: string) => void; onError?: (message: string) => void },
    abortSignal?: AbortSignal
  ): Promise<void> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          where: { docType: "minutes" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!project) throw new Error("项目不存在");
    if (project.documents.length === 0) throw new Error("请先生成会议纪要");

    const minutesContent = project.documents[0].content;

    try {
      const mindmapMarkdown = await this.mindmapAgent.generateMindmap(
        minutesContent,
        (chunk) => callbacks.onMindmap?.(chunk),
        abortSignal
      );

      // 保存思维导图到 GeneratedDocument
      await prisma.generatedDocument.create({
        data: {
          projectId,
          docType: "mindmap",
          content: mindmapMarkdown,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "生成思维导图失败";
      callbacks.onError?.(message);
    }
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
   * 构建上下文字符串（含共享知识库摘要 + 附件资料）
   *
   * @param attachments 当前用户消息携带的附件，注入为"附件资料"段落供专家引用
   */
  private async buildContextString(
    history: ConversationMessage[],
    projectId?: string,
    attachments?: MessageAttachment[]
  ): Promise<string> {
    // 保留最近20轮完整对话
    const recentMessages = history.slice(-MAX_CONTEXT_ROUNDS * 3);

    const lines: string[] = [];
    for (const m of recentMessages) {
      const roleLabel = await this.getRoleLabel(m.role);
      lines.push(`[${roleLabel}]：${m.content}`);
    }

    // 注入附件资料（拼装为独立段落，供主持人/专家引用）
    if (attachments && attachments.length > 0) {
      const attachmentLines = attachments.map(
        (a) => `--- 附件：${a.name} ---\n${a.text}`
      );
      lines.push(`\n【附件资料】\n${attachmentLines.join("\n\n")}`);
    }

    // 注入共享知识库摘要
    if (projectId) {
      const knowledgeSummary = await queryKnowledge(projectId);
      if (knowledgeSummary) {
        lines.push(`\n【共享知识库】\n${knowledgeSummary}`);
      }
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
