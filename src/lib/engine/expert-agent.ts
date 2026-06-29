import { streamText, stepCountIs, type ToolSet, type EmbeddingModel } from "ai";
import type { LanguageModel } from "ai";
import { getExpertById } from "@/lib/experts/definitions";
import { buildExpertSystemPrompt, buildExpertUserPrompt } from "./prompts/expert-system";
import { consumeStreamWithRetry, getModelId } from "./host-agent";
import { EXPERT_CALL_SETTINGS } from "@/lib/llm";
import { promptCache, getKnowledgeVersion, buildCacheKey } from "./prompt-cache";
import { fnv1aHash } from "./vector-store";
import { injectMemoryIntoPrompt } from "./expert-memory";

export class ExpertAgent {
  constructor(
    private model: LanguageModel,
    private llmConfig: { maxTokens: number; temperature: number },
    private tools: ToolSet
  ) {}

  /**
   * 专家回应：基于主持人引导和对话历史，生成带 [HOOK] 的回复
   * 流式输出专家回复
   *
   * @param projectId 项目 ID（用于 prompt 缓存 key）
   * @param requireHook 是否需要 [HOOK] 结尾（最后一位专家为 true，其他为 false）
   * @param abortSignal 中止信号（用户点击停止生成时触发）
   */
  async respond(
    projectId: string,
    expertId: string,
    hostGuidance: string,
    userMessage: string,
    conversationContext: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal,
    requireHook: boolean = true,
    onToolCall?: (toolName: string, input: unknown) => void,
    onToolResult?: (toolName: string, input: unknown, output: unknown) => void,
    phase: "diverge" | "converge" = "diverge",
    embeddingModel?: EmbeddingModel
  ): Promise<string> {
    const expert = await getExpertById(expertId);
    if (!expert) {
      throw new Error(`Expert not found: ${expertId}`);
    }

    const currentDate = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" });
    const dateStr = currentDate.split(" ")[0]; // 仅日期部分，用于缓存 key

    // P0-5: 检查 prompt 缓存
    // P2-2: 启用语义检索时，cache key 含 retrievalHash 区分不同查询
    const knowledgeVersion = getKnowledgeVersion(projectId);
    const retrievalHash = embeddingModel
      ? fnv1aHash(conversationContext.slice(0, 500))
      : "";
    const cacheKey = buildCacheKey(projectId, expertId, knowledgeVersion, requireHook, phase, dateStr, retrievalHash);

    let systemPrompt = promptCache.get(cacheKey);
    if (!systemPrompt) {
      systemPrompt = buildExpertSystemPrompt(expert, currentDate, requireHook, phase);
      promptCache.set(cacheKey, systemPrompt);
    }

    // P2-3: 注入专家长期记忆（不在缓存中，每次动态查询）
    if (embeddingModel) {
      const memorySection = await injectMemoryIntoPrompt(expertId, userMessage, embeddingModel);
      if (memorySection) {
        systemPrompt += `\n\n${memorySection}`;
      }
    }

    return consumeStreamWithRetry(() => streamText({
      model: this.model,
      system: systemPrompt,
      prompt: buildExpertUserPrompt(hostGuidance, userMessage, conversationContext),
      maxOutputTokens: Math.max(this.llmConfig.maxTokens, 3072),
      temperature: this.llmConfig.temperature,
      tools: this.tools,
      stopWhen: stepCountIs(4),
      abortSignal,
      ...EXPERT_CALL_SETTINGS,
      onError({ error }) {
        console.error("[LLM Error - ExpertAgent.respond]", error);
      },
      onAbort() {
        console.log(`[ExpertAgent.respond aborted - ${expertId}]`);
      },
    }), onChunk, onToolCall, onToolResult, {
      model: getModelId(this.model),
      projectId,
    });
  }
}
