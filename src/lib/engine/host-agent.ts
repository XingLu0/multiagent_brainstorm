import { streamText, stepCountIs, type ToolSet } from "ai";
import type { LanguageModel } from "ai";
import { getExpertsByIds } from "@/lib/experts/definitions";
import { buildHostSystemPrompt, buildHostUserPrompt } from "./prompts/host-system";
import { buildSummarySystemPrompt, buildSummaryUserPrompt } from "./prompts/summary";
import { buildMinutesSystemPrompt, buildMinutesUserPrompt } from "./prompts/minutes";
import { buildPauseSummarySystemPrompt, buildPauseSummaryUserPrompt } from "./prompts/pause";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";
import { logLLMCall } from "@/lib/llm-logger";

/** LLM 调用日志上下文（可选，传入后自动记录调用日志） */
export interface LLMLogContext {
  model: string;
  projectId?: string;
}

/**
 * 从 LanguageModel 获取模型 ID。
 * AI SDK v6 的 LanguageModel 是联合类型（string | LanguageModelV3 | LanguageModelV2），
 * 需用 typeof 缩窄后安全访问 modelId。
 */
export function getModelId(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}

function getCurrentDateString(): string {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" });
}

export interface HostGuideResult {
  guidance: string;
  designatedExpertIds: string[];
}

export interface EngineCallbacks {
  onHost?: (chunk: string, expertIds?: string[]) => void;
  onExpert?: (chunk: string, expertId: string, round?: number) => void;
  onExpertStart?: (expertId: string, round: number) => void;
  onSummary?: (content: string) => void;
  onMinutes?: (content: string) => void;
  onDocument?: (content: string) => void;
  onError?: (message: string) => void;
  onToolCall?: (expertId: string | null, toolName: string, input: unknown) => void;
  onPause?: (chunk: string, remainingTurns?: number) => void;
  /** 软停止触发：当前专家说完后不再继续下一轮 */
  onSoftStop?: () => void;
  /** 软停止完成：当前专家已说完，讨论结束 */
  onSoftStopComplete?: () => void;
}

/**
 * 消费 streamText 的 fullStream，捕获错误并检查空响应。
 * AI SDK v6 的 streamText 会抑制错误，textStream 不抛异常，
 * 必须使用 fullStream 才能捕获 error 事件。
 *
 * @param logContext 可选，传入后自动记录 LLM 调用日志到数据库
 */
export async function consumeStream(
  result: {
    fullStream: AsyncIterable<{
      type: string;
      text?: string;
      error?: unknown;
      toolName?: string;
      toolCallId?: string;
      input?: unknown;
      output?: unknown;
    }>;
    usage?: PromiseLike<{
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    }>;
  },
  onChunk: (chunk: string) => void,
  onToolCall?: (toolName: string, input: unknown) => void,
  onToolResult?: (toolName: string, input: unknown, output: unknown) => void,
  logContext?: LLMLogContext
): Promise<string> {
  const startTime = logContext ? performance.now() : 0;
  let fullText = "";
  let streamError: Error | null = null;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        if (part.text) {
          fullText += part.text;
          onChunk(part.text);
        }
        break;
      case "tool-call":
        if (onToolCall && part.toolName) {
          onToolCall(part.toolName, part.input);
        }
        break;
      case "tool-result":
        if (onToolResult && part.toolName) {
          onToolResult(part.toolName, part.input, part.output);
        }
        break;
      case "error":
        streamError = part.error as Error;
        break;
    }
  }

  if (streamError) {
    if (logContext) {
      await logLLMCall({
        model: logContext.model,
        projectId: logContext.projectId,
        durationMs: Math.round(performance.now() - startTime),
        success: false,
        errorMessage: streamError.message,
      });
    }
    throw new Error(`AI模型调用失败: ${streamError.message}`);
  }
  if (!fullText.trim()) {
    if (logContext) {
      await logLLMCall({
        model: logContext.model,
        projectId: logContext.projectId,
        durationMs: Math.round(performance.now() - startTime),
        success: false,
        errorMessage: "空响应",
      });
    }
    throw new Error(
      "AI模型返回了空响应，请检查API配置和模型名称是否正确。可点击「测试连接」按钮验证。"
    );
  }

  // 成功时记录
  if (logContext) {
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    if (result.usage) {
      try {
        const usage = await result.usage;
        inputTokens = usage.promptTokens;
        outputTokens = usage.completionTokens;
      } catch {
        // 忽略 usage 获取失败
      }
    }
    await logLLMCall({
      model: logContext.model,
      projectId: logContext.projectId,
      durationMs: Math.round(performance.now() - startTime),
      success: true,
      inputTokens,
      outputTokens,
    });
  }

  return fullText;
}

/**
 * DEF-07: 包裹 consumeStream，空响应时自动重试 1 次。
 * streamFactory 用于重新发起 streamText 调用。
 */
export async function consumeStreamWithRetry(
  streamFactory: () => Parameters<typeof consumeStream>[0],
  onChunk: (chunk: string) => void,
  onToolCall?: (toolName: string, input: unknown) => void,
  onToolResult?: (toolName: string, input: unknown, output: unknown) => void,
  logContext?: LLMLogContext
): Promise<string> {
  const maxRetries = 1;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await consumeStream(streamFactory(), onChunk, onToolCall, onToolResult, logContext);
    } catch (error) {
      if (attempt < maxRetries && error instanceof Error && error.message.includes("空响应")) {
        console.warn(`[DEF-07] LLM 返回空响应，正在重试 (${attempt + 1}/${maxRetries})...`);
        continue;
      }
      throw error;
    }
  }
  throw new Error("unreachable");
}

export class HostAgent {
  constructor(
    private model: LanguageModel,
    private llmConfig: { maxTokens: number; temperature: number },
    private tools: ToolSet
  ) {}

  /**
   * 引导对话：概括用户想法，指定1~3位专家发言
   * 流式输出主持人引导语
   */
  async guide(
    userMessage: string,
    expertIds: string[],
    conversationHistory: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal,
    onToolCall?: (toolName: string, input: unknown) => void,
    phase: "diverge" | "converge" = "diverge",
    projectId?: string
  ): Promise<HostGuideResult> {
    const experts = await getExpertsByIds(expertIds);
    const currentDate = getCurrentDateString();
    const messages = [
      { role: "system" as const, content: buildHostSystemPrompt(currentDate, phase) },
      ...conversationHistory.map((m) => ({
        role: "user" as const,
        content: m.content,
      })),
      { role: "user" as const, content: buildHostUserPrompt(userMessage, experts) },
    ];

    const fullText = await consumeStreamWithRetry(() => streamText({
      model: this.model,
      messages,
      maxOutputTokens: this.llmConfig.maxTokens,
      temperature: this.llmConfig.temperature,
      tools: this.tools,
      stopWhen: stepCountIs(3),
      abortSignal,
      ...DEFAULT_CALL_SETTINGS,
      onError({ error }) {
        console.error("[LLM Error - HostAgent.guide]", error);
      },
      onAbort() {
        console.log("[HostAgent.guide aborted]");
      },
    }), onChunk, onToolCall, undefined, projectId ? { model: getModelId(this.model), projectId } : undefined);

    // 解析指定的专家ID（支持多专家 [EXPERTS:id1,id2] 和单专家 [EXPERT:id]）
    const multiMatch = fullText.match(/\[EXPERTS:([\w,]+)\]/);
    const singleMatch = fullText.match(/\[EXPERT:(\w+)\]/);
    const designatedExpertIds = multiMatch
      ? multiMatch[1].split(",").filter(Boolean)
      : singleMatch
      ? [singleMatch[1]]
      : expertIds.slice(0, 2);

    // 移除 [EXPERT:xxx] 或 [EXPERTS:xxx] 标记
    const guidance = fullText
      .replace(/\[EXPERTS:[\w,]+\]/, "")
      .replace(/\[EXPERT:\w+\]/, "")
      .trim();

    return { guidance, designatedExpertIds };
  }

  /**
   * 生成阶段总结
   */
  async generateSummary(
    conversationHistory: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal,
    projectId?: string
  ): Promise<string> {
    const currentDate = getCurrentDateString();
    return consumeStreamWithRetry(() => streamText({
      model: this.model,
      system: buildSummarySystemPrompt(currentDate),
      prompt: buildSummaryUserPrompt(conversationHistory),
      maxOutputTokens: this.llmConfig.maxTokens,
      temperature: this.llmConfig.temperature,
      abortSignal,
      ...DEFAULT_CALL_SETTINGS,
      onError({ error }) {
        console.error("[LLM Error - HostAgent.generateSummary]", error);
      },
    }), onChunk, undefined, undefined, projectId ? { model: getModelId(this.model), projectId } : undefined);
  }

  /**
   * 生成中场总结（暂停讨论时使用）
   * 与阶段总结不同：中场总结侧重当前进展回顾 + 邀请用户补充信息
   */
  async generateMidDiscussionSummary(
    conversationContext: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal,
    projectId?: string
  ): Promise<string> {
    const currentDate = getCurrentDateString();
    return consumeStreamWithRetry(() => streamText({
      model: this.model,
      system: buildPauseSummarySystemPrompt(currentDate),
      prompt: buildPauseSummaryUserPrompt(conversationContext),
      maxOutputTokens: this.llmConfig.maxTokens,
      temperature: this.llmConfig.temperature,
      abortSignal,
      ...DEFAULT_CALL_SETTINGS,
      onError({ error }) {
        console.error("[LLM Error - HostAgent.generateMidDiscussionSummary]", error);
      },
    }), onChunk, undefined, undefined, projectId ? { model: getModelId(this.model), projectId } : undefined);
  }

  /**
   * 生成最终会议纪要
   */
  async generateMinutes(
    projectTitle: string,
    conversationHistory: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal,
    projectId?: string
  ): Promise<string> {
    const currentDate = getCurrentDateString();
    return consumeStreamWithRetry(() => streamText({
      model: this.model,
      system: buildMinutesSystemPrompt(currentDate),
      prompt: buildMinutesUserPrompt(projectTitle, conversationHistory),
      maxOutputTokens: this.llmConfig.maxTokens * 2,
      temperature: this.llmConfig.temperature,
      abortSignal,
      ...DEFAULT_CALL_SETTINGS,
      onError({ error }) {
        console.error("[LLM Error - HostAgent.generateMinutes]", error);
      },
    }), onChunk, undefined, undefined, projectId ? { model: getModelId(this.model), projectId } : undefined);
  }
}
