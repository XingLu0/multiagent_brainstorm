/**
 * 知识库管理器
 *
 * 封装 knowledge-base.ts 的调用逻辑，
 * 为引擎提供统一的知识提取入口。
 */

import type { LanguageModel, EmbeddingModel } from "ai";
import { extractAndSaveKnowledge } from "./knowledge-base";

/**
 * 在每轮专家讨论后提取知识条目
 *
 * 静默处理错误，不阻塞讨论流程。
 *
 * @param model LLM 模型实例
 * @param projectId 项目 ID
 * @param context 当前讨论上下文
 * @param abortSignal 中止信号
 * @param embeddingModel P2-2: 可选的 embedding 模型，用于同步生成知识向量
 */
export async function extractKnowledgeForRound(
  model: LanguageModel,
  projectId: string,
  context: string,
  abortSignal?: AbortSignal,
  embeddingModel?: EmbeddingModel,
  expertIds?: string[]
): Promise<void> {
  try {
    await extractAndSaveKnowledge(model, projectId, context, abortSignal, embeddingModel, expertIds);
  } catch {
    // 知识提取失败不影响讨论流程
  }
}
