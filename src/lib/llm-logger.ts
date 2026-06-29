/**
 * LLM 调用日志模块
 *
 * 记录每次 LLM 调用的模型名、token 用量、耗时和成功/失败状态。
 * 静默处理错误，不阻塞主流程。
 */

import { prisma } from "@/lib/prisma";

export interface LLMLogEntry {
  model: string;
  projectId?: string;
  durationMs: number;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

/**
 * 记录一次 LLM 调用到数据库
 * 静默处理错误，不影响主流程
 */
export async function logLLMCall(entry: LLMLogEntry): Promise<void> {
  try {
    await prisma.lLMCallLog.create({ data: entry });
  } catch (e) {
    console.error("[LLM Logger] Failed to log LLM call:", e);
  }
}

export interface LLMStats {
  totalCalls: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number;
  recentCalls: {
    id: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    durationMs: number;
    success: boolean;
    errorMessage: string | null;
    projectId: string | null;
    createdAt: Date;
  }[];
}

/**
 * 获取 LLM 调用统计信息
 */
export async function getLLMStats(limit = 20): Promise<LLMStats> {
  const [total, successCount, tokenAgg, durationAgg, recent] = await Promise.all([
    prisma.lLMCallLog.count(),
    prisma.lLMCallLog.count({ where: { success: true } }),
    prisma.lLMCallLog.aggregate({
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.lLMCallLog.aggregate({
      _avg: { durationMs: true },
    }),
    prisma.lLMCallLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  return {
    totalCalls: total,
    successCount,
    failedCount: total - successCount,
    successRate: total > 0 ? successCount / total : 0,
    totalInputTokens: tokenAgg._sum.inputTokens ?? 0,
    totalOutputTokens: tokenAgg._sum.outputTokens ?? 0,
    avgDurationMs: durationAgg._avg.durationMs ?? 0,
    recentCalls: recent,
  };
}
