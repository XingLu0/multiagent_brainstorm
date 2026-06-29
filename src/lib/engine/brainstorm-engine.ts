/**
 * BrainstormEngine — 脑暴引擎
 * 采用 Strangler Fig 模式，职责委托给独立模块。
 */

import { prisma } from "@/lib/prisma";
import { getExpertById } from "@/lib/experts/definitions";
import { HostAgent, type EngineCallbacks, type HostGuideResult } from "./host-agent";
import { ExpertAgent } from "./expert-agent";
import { DocumentAgent, type DocumentType } from "./document-agent";
import { MindmapAgent } from "./mindmap-agent";
import { createEngineTools } from "./tools";
import type { LanguageModel, EmbeddingModel } from "ai";

import { MAX_CONTEXT_ROUNDS } from "./constants";
import {
  getNextSeq,
  persistMessage,
  loadConversationHistory,
  consumeUnconsumedInterventions,
  buildContextString,
  type MessageAttachment,
} from "./conversation-manager";
import { extractKnowledgeForRound } from "./knowledge-manager";
import { getKnowledgeCounts } from "./knowledge-base";
import { shouldAutoSummarize } from "./expert-scheduler";
import { DocumentManager } from "./document-manager";
import {
  createDiscussionActor,
  getCurrentExpertId,
  getCurrentRound,
  isLastExpert,
} from "./discussion-machine";
import { registerDiscussionActor, unregisterDiscussionActor } from "./soft-stop-registry";

export type { MessageAttachment };

export class BrainstormEngine {
  private model: LanguageModel;
  private hostAgent: HostAgent;
  private expertAgent: ExpertAgent;
  private documentManager: DocumentManager;
  /** P2-1: 记录每个项目最近动态总结的轮次，防止与固定总结冲突 */
  private lastDynamicSummaryTurn = new Map<string, number>();
  /** P2-2: 可选的 embedding 模型，用于语义检索 */
  private embeddingModel?: EmbeddingModel;

  constructor(
    model: LanguageModel,
    llmConfig: { maxTokens: number; temperature: number },
    searchApiKey: string,
    embeddingModel?: EmbeddingModel
  ) {
    this.model = model;
    this.embeddingModel = embeddingModel;
    const tools = createEngineTools({ searchApiKey });
    this.hostAgent = new HostAgent(model, llmConfig, tools);
    this.expertAgent = new ExpertAgent(model, llmConfig, tools);
    const documentAgent = new DocumentAgent(model, llmConfig);
    const mindmapAgent = new MindmapAgent(model);
    this.documentManager = new DocumentManager(this.hostAgent, documentAgent, mindmapAgent, model);
  }

  /**
   * 处理用户消息：持久化 → 检查自动总结 → 主持人引导 → 专家轮次对话
   */
  async handleUserMessage(
    projectId: string,
    content: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal,
    attachments?: MessageAttachment[]
  ): Promise<void> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") throw new Error("该项目已结束，无法继续对话");

    const expertIds = JSON.parse(project.expertIds) as string[];

    // 1. 持久化用户消息
    const userMetadata = attachments?.length
      ? JSON.stringify({ attachments: attachments.map(a => ({ name: a.name, type: a.type, length: a.text.length })) })
      : undefined;
    await persistMessage(projectId, "user", content, userMetadata, expertIds);

    // 2. 更新轮次计数 + P3-1: 清除 redo 栈（新消息发送时重置 currentSeq）
    const newTurnCount = project.turnCount + 1;
    if (project.currentSeq > 0) {
      await prisma.project.update({ where: { id: projectId }, data: { currentSeq: 0 } });
    }

    // 3. 加载对话历史 + 构建上下文
    const history = await loadConversationHistory(projectId);
    const currentSeq = await getNextSeq(projectId);
    const contextString = await buildContextString(history, projectId, attachments, this.model, currentSeq, content, this.embeddingModel);

    // 4. 主持人引导
    const designatedExpertIdsHolder: { current: string[] | undefined } = { current: undefined };
    const guideResult = await this.hostAgent.guide(
      content, expertIds, history.slice(-MAX_CONTEXT_ROUNDS),
      (chunk) => callbacks.onHost?.(chunk, designatedExpertIdsHolder.current),
      abortSignal,
      (toolName, input) => callbacks.onToolCall?.(null, toolName, input),
      (project.phase || "diverge") as "diverge" | "converge",
      projectId
    );
    designatedExpertIdsHolder.current = guideResult.designatedExpertIds;

    await prisma.project.update({ where: { id: projectId }, data: { turnCount: newTurnCount } });
    await persistMessage(projectId, "host", guideResult.guidance,
      JSON.stringify({ designatedExpertIds: guideResult.designatedExpertIds }), expertIds);

    // 5. 自动总结（P2-1: 跳过已触发动态总结的轮次）
    const dynamicSummaryTurn = this.lastDynamicSummaryTurn.get(projectId);
    const alreadySummarized = dynamicSummaryTurn === newTurnCount;
    if (shouldAutoSummarize(newTurnCount) && !alreadySummarized) {
      const refreshedHistory = await loadConversationHistory(projectId);
      const refreshedSeq = await getNextSeq(projectId);
      const refreshedContext = await buildContextString(refreshedHistory, projectId, undefined, this.model, refreshedSeq);
      const summary = await this.hostAgent.generateSummary(refreshedContext, (chunk) => callbacks.onSummary?.(chunk), abortSignal, projectId);
      await persistMessage(projectId, "summary", summary, undefined, expertIds);
    }

    // 6. 专家讨论
    await this.runExpertDiscussion(projectId, guideResult, content, contextString, callbacks, abortSignal, undefined, (project.phase || "diverge") as "diverge" | "converge");
  }

  /**
   * 处理用户干预指令：持久化为 intervene 类型消息，不触发讨论流程
   */
  async handleIntervene(projectId: string, directive: string, abortSignal?: AbortSignal): Promise<void> {
    if (abortSignal?.aborted) return;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") throw new Error("该项目已结束，无法继续对话");
    const expertIds = JSON.parse(project.expertIds) as string[];
    await persistMessage(projectId, "user", directive, JSON.stringify({ type: "intervene" }), expertIds);
  }

  /**
   * 动态专家变更：邀请新专家或移除已有专家
   */
  async handleExpertChange(projectId: string, action: "add" | "remove", expertId: string): Promise<string[]> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") throw new Error("该项目已结束，无法修改专家");
    if (project.turnCount >= 3) throw new Error("已进入最后两轮讨论，不允许修改专家阵容");

    const expertIds = JSON.parse(project.expertIds) as string[];

    // 校验每轮 1 次变更
    const existingChange = await prisma.message.findFirst({
      where: { projectId, role: "system", metadata: { contains: '"type":"expert_change"' } },
      orderBy: { seq: "desc" },
    });
    if (existingChange?.metadata) {
      try {
        const meta = JSON.parse(existingChange.metadata) as { type?: string; turnCount?: number };
        if (meta.type === "expert_change" && meta.turnCount === project.turnCount) {
          throw new Error("本轮已修改过专家阵容，每轮仅允许一次变更");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("本轮")) throw e;
      }
    }

    const expert = await getExpertById(expertId);
    if (!expert) throw new Error("专家不存在");

    if (action === "add") {
      if (expertIds.includes(expertId)) throw new Error("该专家已在讨论中");
      expertIds.push(expertId);
    } else if (action === "remove") {
      if (!expertIds.includes(expertId)) throw new Error("该专家不在当前讨论中");
      if (expertIds.length <= 1) throw new Error("至少需要保留一位专家");
      expertIds.splice(expertIds.indexOf(expertId), 1);
    } else {
      throw new Error("无效的操作类型");
    }

    await prisma.project.update({ where: { id: projectId }, data: { expertIds: JSON.stringify(expertIds) } });
    await persistMessage(projectId, "system",
      action === "add" ? `已邀请「${expert.name}」加入讨论` : `已将「${expert.name}」移出讨论`,
      JSON.stringify({ type: "expert_change", action, expertId, expertName: expert.name, turnCount: project.turnCount }), expertIds);

    return expertIds;
  }

  /**
   * 阶段切换：发散 → 收敛
   */
  async handlePhaseTransition(projectId: string, newPhase: "converge"): Promise<void> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") throw new Error("该项目已结束，无法切换阶段");
    if (project.phase === newPhase) throw new Error(`当前已处于${newPhase === "converge" ? "收敛" : "发散"}阶段`);

    const oldPhase = project.phase;
    await prisma.project.update({ where: { id: projectId }, data: { phase: newPhase } });
    await persistMessage(projectId, "system",
      newPhase === "converge" ? "讨论已进入收敛阶段，专家将聚焦方案评估与取舍" : "讨论已进入发散阶段",
      JSON.stringify({ type: "phase_change", from: oldPhase, to: newPhase }),
      JSON.parse(project.expertIds) as string[]);
  }

  /**
   * 编辑用户消息后重建对话
   */
  async handleEditedMessage(projectId: string, messageId: string, newContent: string, callbacks: EngineCallbacks, abortSignal?: AbortSignal): Promise<void> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") throw new Error("该项目已结束，无法继续对话");

    const targetMessage = await prisma.message.findUnique({ where: { id: messageId } });
    if (!targetMessage) throw new Error("消息不存在");
    if (targetMessage.role !== "user") throw new Error("只能编辑用户消息");
    if (targetMessage.projectId !== projectId) throw new Error("消息不属于该项目");

    await prisma.message.deleteMany({ where: { projectId, seq: { gt: targetMessage.seq } } });
    await prisma.message.update({ where: { id: messageId }, data: { content: newContent } });

    const history = await loadConversationHistory(projectId);
    const contextString = await buildContextString(history, projectId, undefined, this.model, await getNextSeq(projectId), newContent, this.embeddingModel);
    const expertIds = JSON.parse(project.expertIds) as string[];
    const designatedExpertIdsHolder: { current: string[] | undefined } = { current: undefined };
    const guideResult = await this.hostAgent.guide(
      newContent, expertIds, history.slice(-MAX_CONTEXT_ROUNDS),
      (chunk) => callbacks.onHost?.(chunk, designatedExpertIdsHolder.current),
      abortSignal,
      (toolName, input) => callbacks.onToolCall?.(null, toolName, input),
      (project.phase || "diverge") as "diverge" | "converge",
      projectId
    );
    designatedExpertIdsHolder.current = guideResult.designatedExpertIds;

    await persistMessage(projectId, "host", guideResult.guidance,
      JSON.stringify({ designatedExpertIds: guideResult.designatedExpertIds }), expertIds);

    await this.runExpertDiscussion(projectId, guideResult, newContent, contextString, callbacks, abortSignal, undefined, (project.phase || "diverge") as "diverge" | "converge");
  }

  /**
   * 专家讨论核心逻辑（XState 状态机驱动）
   *
   * Bridge 模式：状态机负责调度决策，引擎宿主负责 SSE 流式输出。
   */
  private async runExpertDiscussion(
    projectId: string,
    guideResult: HostGuideResult,
    userMessage: string,
    contextString: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal,
    resumeState?: { startRound: number; startIndex: number; completedTurns: number },
    phase: "diverge" | "converge" = "diverge"
  ): Promise<void> {
    const activeExpertIds = guideResult.designatedExpertIds;
    let turnContext = contextString;

    // 注入未消费的用户干预指令
    const interventions = await consumeUnconsumedInterventions(projectId);
    if (interventions.length > 0) {
      turnContext += `\n\n【用户干预指令】\n${interventions.map(d => `- ${d}`).join("\n")}`;
    }

    // 创建状态机 Actor
    const actor = createDiscussionActor({ expertIds: activeExpertIds });
    actor.start();

    if (resumeState) {
      actor.send({ type: "RESUME_FROM", expertIds: activeExpertIds, ...resumeState });
    } else {
      actor.send({ type: "START", expertIds: activeExpertIds });
      actor.send({ type: "HOST_DONE" });
    }

    // 注册 Actor 到软停止注册表（允许跨请求触发 SOFT_STOP）
    registerDiscussionActor(projectId, actor);
    let softStopTriggered = false;

    try {
    // 讨论循环
    while (true) {
      const snapshot = actor.getSnapshot();

      // 完成或中止
      if (snapshot.value === "completed") {
        // 知识提取已在下方 roundAfter !== roundBefore || newSnapshot.value === "completed" 处理
        if (softStopTriggered) {
          callbacks.onSoftStopComplete?.();
        }
        actor.stop();
        return;
      }

      // 暂停
      if (snapshot.value === "paused") {
        const ctx = snapshot.context;
        const pauseSummary = await this.hostAgent.generateMidDiscussionSummary(
          turnContext,
          (chunk) => callbacks.onPause?.(chunk, ctx.totalTurns - ctx.completedTurns),
          abortSignal,
          projectId
        );
        await persistMessage(projectId, "pause", pauseSummary, JSON.stringify({
          type: "pause", guideResult, userMessage,
          completedTurns: ctx.completedTurns, totalTurns: ctx.totalTurns,
          startRound: ctx.currentRound, startIndex: ctx.currentIndex,
          activeExpertIds,
        }), activeExpertIds);
        actor.stop();
        return;
      }

      // 仅在 discussing / softStopping 状态下继续
      if (snapshot.value !== "discussing" && snapshot.value !== "softStopping") {
        actor.stop();
        return;
      }

      // 软停止触发通知（仅第一次进入 softStopping 时）
      if (snapshot.value === "softStopping" && !softStopTriggered) {
        softStopTriggered = true;
        callbacks.onSoftStop?.();
      }

      const expertId = getCurrentExpertId(snapshot);
      if (!expertId || abortSignal?.aborted) { actor.stop(); return; }

      const round = getCurrentRound(snapshot);
      const isLast = isLastExpert(snapshot);

      callbacks.onExpertStart?.(expertId, round);

      // 收集搜索结果
      const expertSearchResults: string[] = [];

      // 专家发言
      const expertResponse = await this.expertAgent.respond(
        projectId, expertId, guideResult.guidance, userMessage, turnContext,
        (chunk) => callbacks.onExpert?.(chunk, expertId, round),
        abortSignal, isLast,
        (toolName, input) => callbacks.onToolCall?.(expertId, toolName, input),
        (toolName, input, output) => {
          if (toolName === "webSearch") {
            const queries = typeof input === "object" && input !== null ? (input as { queries?: string[] }).queries ?? [] : [];
            const queryLabel = queries.length > 0 ? queries.join(" / ") : "未知关键词";
            const results = typeof output === "object" && output !== null ? (output as { results?: string }).results ?? "" : String(output);
            if (results) expertSearchResults.push(`搜索"${queryLabel}"的结果：\n${results}`);
          }
        },
        phase,
        this.embeddingModel
      );

      // 持久化专家消息
      await persistMessage(projectId, `expert:${expertId}`, expertResponse, JSON.stringify({ expertId, round }), activeExpertIds);

      // 追加搜索结果 + 专家发言到上下文
      const expert = await getExpertById(expertId);
      if (expertSearchResults.length > 0) {
        turnContext += `\n\n[${expert?.name ?? "专家"}的搜索发现]：\n${expertSearchResults.join("\n\n")}`;
      }
      turnContext += `\n\n[${expert?.name ?? "专家"}]：${expertResponse}`;

      if (abortSignal?.aborted) { actor.stop(); return; }

      // 推进状态机
      const roundBefore = getCurrentRound(actor.getSnapshot());
      actor.send({ type: "EXPERT_DONE" });
      const newSnapshot = actor.getSnapshot();
      const roundAfter = getCurrentRound(newSnapshot);

      // 轮次结束时提取知识
      if (roundAfter !== roundBefore || newSnapshot.value === "completed") {
        await extractKnowledgeForRound(this.model, projectId, turnContext, abortSignal, this.embeddingModel, [expertId]);

        // P2-1: 动态总结触发 — 查询知识计数，通知状态机
        if (newSnapshot.value === "discussing" || newSnapshot.value === "softStopping") {
          const counts = await getKnowledgeCounts(projectId);
          actor.send({
            type: "TRIGGER_SUMMARY",
            consensusCount: counts.consensus,
            divergenceCount: counts.divergence,
          });
          const summarySnapshot = actor.getSnapshot();
          if (summarySnapshot.value === "summarizing") {
            // 状态机决定触发动态总结
            const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { turnCount: true } });
            this.lastDynamicSummaryTurn.set(projectId, proj?.turnCount ?? 0);
            const summaryContext = await buildContextString(
              await loadConversationHistory(projectId), projectId, undefined,
              this.model, await getNextSeq(projectId)
            );
            const summary = await this.hostAgent.generateSummary(
              summaryContext, (chunk) => callbacks.onSummary?.(chunk),
              abortSignal, projectId
            );
            await persistMessage(projectId, "summary", summary, undefined, activeExpertIds);
            actor.send({ type: "SUMMARY_DONE" });
          }
        }
      }
    }
    } finally {
      // 注销 Actor，允许后续讨论重新注册
      unregisterDiscussionActor(projectId);
    }
  }

  /**
   * 继续被暂停的专家讨论
   */
  async handleContinueDiscussion(projectId: string, userInput: string | null, callbacks: EngineCallbacks, abortSignal?: AbortSignal): Promise<void> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") throw new Error("该项目已结束，无法继续对话");

    // 查找最后一条暂停消息
    const pauseMessage = await prisma.message.findFirst({ where: { projectId, role: "pause" }, orderBy: { seq: "desc" } });
    if (!pauseMessage) throw new Error("未找到暂停点，无法继续讨论");

    // 防止重复继续
    const expertCountAfterPause = await prisma.message.count({ where: { projectId, seq: { gt: pauseMessage.seq }, role: { startsWith: "expert:" } } });
    if (expertCountAfterPause > 0) throw new Error("该暂停点的讨论已继续，无需重复操作");

    // 解析暂停元数据
    const pauseMeta = JSON.parse(pauseMessage.metadata!) as { guideResult: HostGuideResult; userMessage: string; completedTurns: number; totalTurns: number; startRound: number; startIndex: number; activeExpertIds: string[] };

    // 可选：持久化用户补充输入
    if (userInput?.trim()) {
      await persistMessage(projectId, "user", userInput.trim(), undefined,
        JSON.parse(project.expertIds) as string[]);
    }

    // 重新加载上下文
    const history = await loadConversationHistory(projectId);
    const contextString = await buildContextString(history, projectId, undefined, this.model, await getNextSeq(projectId));

    // 继续剩余专家讨论
    await this.runExpertDiscussion(projectId, pauseMeta.guideResult, pauseMeta.userMessage, contextString, callbacks, abortSignal, { startRound: pauseMeta.startRound, startIndex: pauseMeta.startIndex, completedTurns: pauseMeta.completedTurns }, (project.phase || "diverge") as "diverge" | "converge");
  }

  async generateSummary(projectId: string, callbacks: EngineCallbacks, abortSignal?: AbortSignal): Promise<void> {
    await this.documentManager.generateSummary(projectId, callbacks, abortSignal);
  }

  async generateMinutes(projectId: string, callbacks: EngineCallbacks, abortSignal?: AbortSignal): Promise<void> {
    await this.documentManager.generateMinutesWithSetup(projectId, callbacks, abortSignal);
  }

  async generateDocument(projectId: string, docType: DocumentType, content: string, callbacks: EngineCallbacks, abortSignal?: AbortSignal): Promise<void> {
    await this.documentManager.generateDocument(projectId, docType, content, callbacks, abortSignal);
  }

  async generateMindmap(projectId: string, callbacks: { onMindmap?: (chunk: string) => void; onError?: (message: string) => void }, abortSignal?: AbortSignal): Promise<void> {
    await this.documentManager.generateMindmap(projectId, callbacks, abortSignal);
  }
}
