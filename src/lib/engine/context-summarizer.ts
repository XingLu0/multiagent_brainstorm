/**
 * 上下文压缩器
 *
 * P0-4: 当对话历史超过 CONTEXT_COMPRESS_THRESHOLD 时，
 * 对旧消息生成 LLM 摘要，保留最近 CONTEXT_RECENT_KEEP 条完整消息。
 * 摘要结果缓存在内存中，避免重复 LLM 调用。
 */

import { generateText, type LanguageModel } from "ai";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";
import { CONTEXT_RECENT_KEEP } from "./constants";
import { buildContextSummaryPrompt } from "./prompts/context-summary";
import type { ConversationMessage } from "./conversation-manager";

/** 摘要最大字符数 */
const MAX_SUMMARY_LENGTH = 2000;

/** 摘要缓存：key = projectId, value = { lastSummarizedSeq, summary } */
const summaryCache = new Map<string, { lastSummarizedSeq: number; summary: string }>();

/**
 * 压缩上下文：对旧消息生成摘要，保留最近 N 条完整消息
 *
 * @param history 完整对话历史
 * @param projectId 项目 ID（用于缓存）
 * @param model LLM 模型
 * @param lastSeq 最新消息的 seq（用于缓存判断）
 * @returns { summary, recentMessages } 或 null（无需压缩）
 */
export async function compressContext(
  history: ConversationMessage[],
  projectId: string,
  model: LanguageModel,
  lastSeq: number
): Promise<{ summary: string; recentMessages: ConversationMessage[] } | null> {
  // 分割：旧消息 + 近期消息
  const recentMessages = history.slice(-CONTEXT_RECENT_KEEP);
  const oldMessages = history.slice(0, -CONTEXT_RECENT_KEEP);

  // 无旧消息可压缩
  if (oldMessages.length === 0) return null;

  // 检查缓存
  const cached = summaryCache.get(projectId);
  if (cached && cached.lastSummarizedSeq === lastSeq) {
    return { summary: cached.summary, recentMessages };
  }

  try {
    // 构建旧消息文本
    const historyText = oldMessages
      .map((m) => `[${m.role}]：${m.content}`)
      .join("\n\n");

    const { system, prompt } = buildContextSummaryPrompt(historyText);

    const result = await generateText({
      model,
      system,
      prompt,
      ...DEFAULT_CALL_SETTINGS,
    });

    // 截断摘要
    let summary = result.text.trim();
    if (summary.length > MAX_SUMMARY_LENGTH) {
      summary = summary.slice(0, MAX_SUMMARY_LENGTH) + "...";
    }

    // 更新缓存
    summaryCache.set(projectId, { lastSummarizedSeq: lastSeq, summary });

    return { summary, recentMessages };
  } catch {
    // LLM 调用失败，降级为空摘要 + 近期消息
    return { summary: "", recentMessages };
  }
}

/**
 * 清除指定项目的摘要缓存
 */
export function clearSummaryCache(projectId: string): void {
  summaryCache.delete(projectId);
}
