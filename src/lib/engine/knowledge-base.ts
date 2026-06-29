import { generateText, embedMany, type LanguageModel, type EmbeddingModel } from "ai";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";
import { incrementKnowledgeVersion, promptCache } from "./prompt-cache";
import { retrieveTopK } from "./vector-store";
import { getExpertById } from "@/lib/experts/definitions";
import { extractMemoryFromDiscussion, generateMemoryEmbeddings } from "./expert-memory";

/**
 * 知识条目类别
 */
export type KnowledgeCategory =
  | "fact"
  | "decision"
  | "consensus"
  | "divergence"
  | "open_question";

/**
 * 从讨论中提取的知识条目（LLM 返回结构）
 */
interface ExtractedEntry {
  category: KnowledgeCategory;
  content: string;
}

/**
 * 知识库摘要的最大字符数
 */
const MAX_SUMMARY_LENGTH = 1500;

/**
 * 类别优先级（用于截断时排序）
 */
const CATEGORY_PRIORITY: Record<KnowledgeCategory, number> = {
  decision: 5,
  consensus: 4,
  divergence: 3,
  fact: 2,
  open_question: 1,
};

const EXTRACT_SYSTEM_PROMPT = `你是一个知识提取助手。你的任务是从AI脑暴讨论中提取结构化知识条目。

提取以下5种类别的知识：
- fact：讨论中提到的关键事实、数据、指标
- decision：讨论中达成的决策或方向选择
- consensus：专家之间达成的共识
- divergence：专家之间的分歧点
- open_question：尚未解决的问题或待确认的事项

输出格式为JSON数组，每个元素包含 category 和 content 字段：
[{"category":"fact","content":"竞品A市场份额为35%"},{"category":"divergence","content":"产品经理认为应优先MVP，技术架构师认为应先完善架构"}]

规则：
1. 只提取有价值的知识，忽略寒暄和过渡语
2. content 简洁明了，不超过100字
3. 如果讨论内容太少无法提取，返回空数组 []
4. 最多提取10条最重要的知识`;

/**
 * 从讨论上下文中提取结构化知识条目
 */
export async function extractKnowledge(
  model: LanguageModel,
  context: string,
  abortSignal?: AbortSignal
): Promise<ExtractedEntry[]> {
  try {
    // 截取最近的上下文避免 token 爆炸
    const truncatedContext = context.slice(-3000);

    const result = await generateText({
      model,
      system: EXTRACT_SYSTEM_PROMPT,
      prompt: `请从以下讨论内容中提取知识条目：\n\n${truncatedContext}`,
      ...DEFAULT_CALL_SETTINGS,
      abortSignal,
    });

    // 解析 JSON 响应
    const text = result.text.trim();
    // 尝试从响应中提取 JSON 数组
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const entries = JSON.parse(jsonMatch[0]) as ExtractedEntry[];
    if (!Array.isArray(entries)) return [];

    // 过滤合法类别
    const validCategories: KnowledgeCategory[] = [
      "fact",
      "decision",
      "consensus",
      "divergence",
      "open_question",
    ];
    return entries.filter(
      (e) =>
        e &&
        typeof e.category === "string" &&
        typeof e.content === "string" &&
        validCategories.includes(e.category) &&
        e.content.trim().length > 0
    );
  } catch {
    return [];
  }
}

/**
 * 将提取的知识条目保存到数据库
 * @returns 新增条目数（去重后实际写入的数量）
 */
export async function saveKnowledgeEntries(
  projectId: string,
  entries: ExtractedEntry[],
  sourceMessageId?: string
): Promise<number> {
  if (entries.length === 0) return 0;

  // 查询已有条目，避免重复
  const existing = await prisma.knowledgeEntry.findMany({
    where: { projectId },
    select: { content: true },
  });
  const existingContents = new Set(existing.map((e) => e.content));

  const newEntries = entries.filter(
    (e) => !existingContents.has(e.content)
  );

  if (newEntries.length === 0) return 0;

  await prisma.knowledgeEntry.createMany({
    data: newEntries.map((e) => ({
      projectId,
      category: e.category,
      content: e.content,
      sourceMessageId: sourceMessageId ?? null,
    })),
  });

  return newEntries.length;
}

/**
 * P2-1: 查询项目的共识/分歧知识条目数
 * 用于状态机动态总结触发条件判断
 */
export async function getKnowledgeCounts(
  projectId: string
): Promise<{ consensus: number; divergence: number }> {
  const [consensus, divergence] = await Promise.all([
    prisma.knowledgeEntry.count({
      where: { projectId, category: "consensus" },
    }),
    prisma.knowledgeEntry.count({
      where: { projectId, category: "divergence" },
    }),
  ]);
  return { consensus, divergence };
}

/**
 * 查询项目的知识库并格式化为摘要字符串（供 prompt 注入）
 * 按类别优先级排序，总长不超过 MAX_SUMMARY_LENGTH
 */
export async function queryKnowledge(projectId: string): Promise<string> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

  if (entries.length === 0) return "";

  // 按类别优先级排序
  const sorted = [...entries].sort(
    (a, b) =>
      (CATEGORY_PRIORITY[b.category as KnowledgeCategory] ?? 0) -
      (CATEGORY_PRIORITY[a.category as KnowledgeCategory] ?? 0)
  );

  const categoryLabels: Record<string, string> = {
    decision: "决策",
    consensus: "共识",
    divergence: "分歧",
    fact: "事实",
    open_question: "待解问题",
  };

  const lines: string[] = [];
  let totalLength = 0;

  for (const entry of sorted) {
    const label = categoryLabels[entry.category] ?? entry.category;
    const line = `【${label}】${entry.content}`;
    if (totalLength + line.length > MAX_SUMMARY_LENGTH) break;
    lines.push(line);
    totalLength += line.length + 1;
  }

  return lines.join("\n");
}

/**
 * P2-2: 为项目中缺少 embedding 的知识条目批量生成向量
 * 使用 AI SDK embedMany 批量生成
 */
export async function generateEmbeddings(
  projectId: string,
  embeddingModel: EmbeddingModel
): Promise<number> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: { projectId, embedding: null },
    select: { id: true, content: true },
  });

  if (entries.length === 0) return 0;

  try {
    const result = await embedMany({
      model: embeddingModel,
      values: entries.map((e) => e.content),
    });

    // 逐条更新 embedding
    await Promise.all(
      entries.map((entry, i) =>
        prisma.knowledgeEntry.update({
          where: { id: entry.id },
          data: { embedding: JSON.stringify(result.embeddings[i]) },
        })
      )
    );

    return entries.length;
  } catch (error) {
    // DEF-03: 记录 embedding 生成失败原因，便于诊断
    console.error("[generateEmbeddings] embedding 生成失败，将降级为全量知识检索:", error instanceof Error ? error.message : String(error));
    return 0;
  }
}

/**
 * P2-2: 语义检索知识条目
 * 使用 embedding 向量进行 top-K 相似度检索，格式化为摘要字符串
 *
 * 降级策略：embedding 生成失败时回退到 queryKnowledge 全量 dump
 */
export async function queryKnowledgeSemantic(
  projectId: string,
  queryText: string,
  embeddingModel: EmbeddingModel
): Promise<string> {
  try {
    // 生成查询向量
    const queryResult = await embedMany({
      model: embeddingModel,
      values: [queryText.slice(0, 500)],
    });
    const queryVector = queryResult.embeddings[0];

    // 加载所有有 embedding 的知识条目
    const entries = await prisma.knowledgeEntry.findMany({
      where: { projectId, embedding: { not: null } },
      select: { id: true, category: true, content: true, embedding: true },
    });

    if (entries.length === 0) {
      // 没有 embedding 条目，降级为全量 dump
      return queryKnowledge(projectId);
    }

    const results = retrieveTopK(
      entries.map((e) => ({
        id: e.id,
        category: e.category,
        content: e.content,
        embedding: e.embedding,
      })),
      queryVector
    );

    if (results.length === 0) {
      // 语义检索无结果，降级为全量 dump
      return queryKnowledge(projectId);
    }

    const categoryLabels: Record<string, string> = {
      decision: "决策",
      consensus: "共识",
      divergence: "分歧",
      fact: "事实",
      open_question: "待解问题",
    };

    const lines = results.map((r) => {
      const label = categoryLabels[r.category] ?? r.category;
      return `【${label}】${r.content}`;
    });

    return lines.join("\n");
  } catch (error) {
    // DEF-03: 记录语义检索失败，降级为全量 dump
    console.error("[queryKnowledgeSemantic] 语义检索失败，降级为全量知识检索:", error instanceof Error ? error.message : String(error));
    return queryKnowledge(projectId);
  }
}

/**
 * 一站式：提取 + 保存知识条目
 * 在每轮专家讨论后调用，不阻塞流式输出
 * P0-5: 有新知识入库时递增版本号并失效 prompt 缓存
 */
export async function extractAndSaveKnowledge(
  model: LanguageModel,
  projectId: string,
  context: string,
  abortSignal?: AbortSignal,
  embeddingModel?: EmbeddingModel,
  expertIds?: string[]
): Promise<void> {
  const entries = await extractKnowledge(model, context, abortSignal);
  const savedCount = await saveKnowledgeEntries(projectId, entries);

  // P0-5: 有新知识入库时，递增版本号并失效该项目缓存
  if (savedCount > 0) {
    incrementKnowledgeVersion(projectId);
    promptCache.invalidateProject(projectId);

    // P2-2: 有新知识时同步生成 embedding（如果提供了 embeddingModel）
    if (embeddingModel) {
      await generateEmbeddings(projectId, embeddingModel);
    }
  }

  // P2-3: 为每位发言专家提取长期记忆
  if (expertIds && expertIds.length > 0) {
    for (const expertId of expertIds) {
      try {
        const expert = await getExpertById(expertId);
        if (expert) {
          const memoryCount = await extractMemoryFromDiscussion(
            model, expertId, expert.name, context, projectId, abortSignal
          );
          // 有新记忆时生成 embedding
          if (memoryCount > 0 && embeddingModel) {
            await generateMemoryEmbeddings(expertId, embeddingModel);
          }
        }
      } catch {
        // 记忆提取失败不影响主流程
      }
    }
  }
}
