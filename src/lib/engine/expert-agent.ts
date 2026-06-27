import { streamText, stepCountIs, type ToolSet } from "ai";
import type { LanguageModel } from "ai";
import { getExpertById } from "@/lib/experts/definitions";
import { buildExpertSystemPrompt, buildExpertUserPrompt } from "./prompts/expert-system";
import { consumeStream } from "./host-agent";
import { EXPERT_CALL_SETTINGS } from "@/lib/llm";

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
   * @param requireHook 是否需要 [HOOK] 结尾（最后一位专家为 true，其他为 false）
   * @param abortSignal 中止信号（用户点击停止生成时触发）
   */
  async respond(
    expertId: string,
    hostGuidance: string,
    userMessage: string,
    conversationContext: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal,
    requireHook: boolean = true,
    onToolCall?: (toolName: string, input: unknown) => void,
    onToolResult?: (toolName: string, input: unknown, output: unknown) => void,
    phase: "diverge" | "converge" = "diverge"
  ): Promise<string> {
    const expert = await getExpertById(expertId);
    if (!expert) {
      throw new Error(`Expert not found: ${expertId}`);
    }

    const currentDate = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" });
    const result = streamText({
      model: this.model,
      system: buildExpertSystemPrompt(expert, currentDate, requireHook, phase),
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
    });

    return consumeStream(result, onChunk, onToolCall, onToolResult);
  }
}
