/**
 * P2-3: 专家长期记忆
 *
 * 从讨论中提取专家洞察/偏好/经验教训，跨项目积累。
 * 语义检索 top-K 相关记忆注入专家 system prompt。
 */

import { generateText, embedMany, type LanguageModel, type EmbeddingModel } from "ai";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";
import { retrieveTopK } from "./vector-store";

/** 专家记忆类别 */
export type MemoryCategory = "insight" | "preference" | "lesson_learned";

/** 提取的记忆条目（LLM 返回结构） */
interface ExtractedMemory {
  category: MemoryCategory;
  content: string;
}

const EXTRACT_MEMORY_PROMPT = `你是一个专家记忆提取助手。你的任务是从AI脑暴讨论中提取该专家的长期记忆条目。

提取以下3种类别的记忆：
- insight：专家表达的核心洞察、方法论、思维模式
- preference：专家展现的技术/产品偏好、风格倾向
- lesson_learned：专家提及的经验教训、避坑指南

输出格式为JSON数组，每个元素包含 category 和 content 字段：
[{"category":"insight","content":"微服务的核心不是技术而是组织架构"},{"category":"preference","content":"偏好TypeScript的静态类型安全"}]

规则：
1. 只提取该专家本人表达的见解，不要提取其他专家的发言
2. content 简洁明了，不超过100字
3. 如果没有值得记忆的内容，返回空数组 []
4. 最多提取5条最有价值的记忆`;

/**
 * 从讨论上下文中提取专家记忆并保存
 *
 * @param model LLM 模型
 * @param expertId 专家 ID
 * @param expertName 专家名称
 * @param context 讨论上下文
 * @param projectId 项目 ID
 * @param abortSignal 中止信号
 * @returns 新增记忆数（去重后实际写入数）
 */
export async function extractMemoryFromDiscussion(
  model: LanguageModel,
  expertId: string,
  expertName: string,
  context: string,
  projectId: string,
  abortSignal?: AbortSignal
): Promise<number> {
  try {
    const truncatedContext = context.slice(-3000);

    const result = await generateText({
      model,
      system: EXTRACT_MEMORY_PROMPT,
      prompt: `专家名称：${expertName}\n\n请从以下讨论内容中提取该专家的记忆条目：\n\n${truncatedContext}`,
      ...DEFAULT_CALL_SETTINGS,
      abortSignal,
    });

    const text = result.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return 0;

    const memories = JSON.parse(jsonMatch[0]) as ExtractedMemory[];
    if (!Array.isArray(memories)) return 0;

    const validCategories: MemoryCategory[] = ["insight", "preference", "lesson_learned"];
    const validMemories = memories.filter(
      (m) =>
        m &&
        typeof m.category === "string" &&
        typeof m.content === "string" &&
        validCategories.includes(m.category) &&
        m.content.trim().length > 0
    );

    if (validMemories.length === 0) return 0;

    // 查询已有记忆做去重
    const existing = await prisma.expertMemory.findMany({
      where: { expertId },
      select: { content: true },
    });
    const existingContents = new Set(existing.map((m) => m.content));

    const newMemories = validMemories.filter((m) => !existingContents.has(m.content));
    if (newMemories.length === 0) return 0;

    await prisma.expertMemory.createMany({
      data: newMemories.map((m) => ({
        expertId,
        projectId,
        content: m.content,
        category: m.category,
      })),
    });

    return newMemories.length;
  } catch {
    return 0;
  }
}

/**
 * 查询专家记忆（语义检索 top-5，降级为按时间排序最近5条）
 *
 * @param expertId 专家 ID
 * @param queryText 查询文本（当前讨论主题）
 * @param embeddingModel 可选的 embedding 模型
 * @returns 格式化的记忆摘要字符串，无记忆时返回空字符串
 */
export async function queryExpertMemory(
  expertId: string,
  queryText: string,
  embeddingModel?: EmbeddingModel
): Promise<string> {
  try {
    if (embeddingModel) {
      // 语义检索路径
      const queryResult = await embedMany({
        model: embeddingModel,
        values: [queryText.slice(0, 500)],
      });
      const queryVector = queryResult.embeddings[0];

      const entries = await prisma.expertMemory.findMany({
        where: { expertId, embedding: { not: null } },
        select: { id: true, content: true, category: true, embedding: true },
      });

      if (entries.length > 0) {
        const results = retrieveTopK(
          entries.map((e) => ({
            id: e.id,
            category: e.category,
            content: e.content,
            embedding: e.embedding!,
          })),
          queryVector,
          5,
          0.3
        );

        if (results.length > 0) {
          return results.map((r) => `- ${r.content}`).join("\n");
        }
      }
    }

    // 降级：按时间排序取最近5条
    const memories = await prisma.expertMemory.findMany({
      where: { expertId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { content: true },
    });

    if (memories.length === 0) return "";
    return memories.map((m) => `- ${m.content}`).join("\n");
  } catch {
    return "";
  }
}

/**
 * 将专家记忆格式化为 prompt 注入段落
 *
 * @param expertId 专家 ID
 * @param queryText 当前讨论主题
 * @param embeddingModel 可选的 embedding 模型
 * @returns 记忆段落字符串，无记忆时返回空字符串
 */
export async function injectMemoryIntoPrompt(
  expertId: string,
  queryText: string,
  embeddingModel?: EmbeddingModel
): Promise<string> {
  const memoryText = await queryExpertMemory(expertId, queryText, embeddingModel);
  if (!memoryText) return "";
  return `【专家历史记忆】\n${memoryText}`;
}

/**
 * P2-3: 为专家记忆生成 embedding 向量
 *
 * @param expertId 专家 ID
 * @param embeddingModel embedding 模型
 * @returns 新生成向量的记忆数
 */
export async function generateMemoryEmbeddings(
  expertId: string,
  embeddingModel: EmbeddingModel
): Promise<number> {
  const entries = await prisma.expertMemory.findMany({
    where: { expertId, embedding: null },
    select: { id: true, content: true },
  });

  if (entries.length === 0) return 0;

  try {
    const result = await embedMany({
      model: embeddingModel,
      values: entries.map((e) => e.content),
    });

    await Promise.all(
      entries.map((entry, i) =>
        prisma.expertMemory.update({
          where: { id: entry.id },
          data: { embedding: JSON.stringify(result.embeddings[i]) },
        })
      )
    );

    return entries.length;
  } catch (error) {
    // DEF-03: 记录专家记忆 embedding 生成失败
    console.error("[generateMemoryEmbeddings] 专家记忆 embedding 生成失败:", error instanceof Error ? error.message : String(error));
    return 0;
  }
}
