import { generateText, type LanguageModel } from "ai";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";

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
 */
export async function saveKnowledgeEntries(
  projectId: string,
  entries: ExtractedEntry[],
  sourceMessageId?: string
): Promise<void> {
  if (entries.length === 0) return;

  // 查询已有条目，避免重复
  const existing = await prisma.knowledgeEntry.findMany({
    where: { projectId },
    select: { content: true },
  });
  const existingContents = new Set(existing.map((e) => e.content));

  const newEntries = entries.filter(
    (e) => !existingContents.has(e.content)
  );

  if (newEntries.length === 0) return;

  await prisma.knowledgeEntry.createMany({
    data: newEntries.map((e) => ({
      projectId,
      category: e.category,
      content: e.content,
      sourceMessageId: sourceMessageId ?? null,
    })),
  });
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
 * 一站式：提取 + 保存知识条目
 * 在每轮专家讨论后调用，不阻塞流式输出
 */
export async function extractAndSaveKnowledge(
  model: LanguageModel,
  projectId: string,
  context: string,
  abortSignal?: AbortSignal
): Promise<void> {
  const entries = await extractKnowledge(model, context, abortSignal);
  await saveKnowledgeEntries(projectId, entries);
}
