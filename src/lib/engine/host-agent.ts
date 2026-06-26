import { streamText, stepCountIs, type ToolSet } from "ai";
import type { LanguageModel } from "ai";
import { getExpertsByIds } from "@/lib/experts/definitions";
import { buildHostSystemPrompt, buildHostUserPrompt } from "./prompts/host-system";
import { buildSummarySystemPrompt, buildSummaryUserPrompt } from "./prompts/summary";
import { buildMinutesSystemPrompt, buildMinutesUserPrompt } from "./prompts/minutes";
import { buildPauseSummarySystemPrompt, buildPauseSummaryUserPrompt } from "./prompts/pause";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";

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
}

/**
 * 消费 streamText 的 fullStream，捕获错误并检查空响应。
 * AI SDK v6 的 streamText 会抑制错误，textStream 不抛异常，
 * 必须使用 fullStream 才能捕获 error 事件。
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
    }>
  },
  onChunk: (chunk: string) => void,
  onToolCall?: (toolName: string, input: unknown) => void,
  onToolResult?: (toolName: string, input: unknown, output: unknown) => void
): Promise<string> {
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
    throw new Error(`AI模型调用失败: ${streamError.message}`);
  }
  if (!fullText.trim()) {
    throw new Error(
      "AI模型返回了空响应，请检查API配置和模型名称是否正确。可点击「测试连接」按钮验证。"
    );
  }

  return fullText;
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
    onToolCall?: (toolName: string, input: unknown) => void
  ): Promise<HostGuideResult> {
    const experts = await getExpertsByIds(expertIds);
    const currentDate = getCurrentDateString();
    const messages = [
      { role: "system" as const, content: buildHostSystemPrompt(currentDate) },
      ...conversationHistory.map((m) => ({
        role: "user" as const,
        content: m.content,
      })),
      { role: "user" as const, content: buildHostUserPrompt(userMessage, experts) },
    ];

    const result = streamText({
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
    });

    const fullText = await consumeStream(result, onChunk, onToolCall);

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
    abortSignal?: AbortSignal
  ): Promise<string> {
    const currentDate = getCurrentDateString();
    const result = streamText({
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
    });

    return consumeStream(result, onChunk);
  }

  /**
   * 生成中场总结（暂停讨论时使用）
   * 与阶段总结不同：中场总结侧重当前进展回顾 + 邀请用户补充信息
   */
  async generateMidDiscussionSummary(
    conversationContext: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const currentDate = getCurrentDateString();
    const result = streamText({
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
    });

    return consumeStream(result, onChunk);
  }

  /**
   * 生成最终会议纪要
   */
  async generateMinutes(
    projectTitle: string,
    conversationHistory: string,
    onChunk: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const currentDate = getCurrentDateString();
    const result = streamText({
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
    });

    return consumeStream(result, onChunk);
  }
}
