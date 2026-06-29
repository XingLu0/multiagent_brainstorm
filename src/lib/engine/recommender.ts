/**
 * P2-4: 智能推荐专家组合
 *
 * 根据项目标题和描述，从可用专家列表中推荐最适合的 2-4 位专家组合。
 */

import { generateText, type LanguageModel } from "ai";
import { getAllExperts } from "@/lib/experts/definitions";
import { DEFAULT_CALL_SETTINGS } from "@/lib/llm";

/** 推荐结果 */
export interface ExpertRecommendationResult {
  expertIds: string[];
  reasoning: string;
}

/** 默认推荐（LLM 失败时降级） */
const DEFAULT_RECOMMENDATION: ExpertRecommendationResult = {
  expertIds: ["pm", "architect"],
  reasoning: "默认推荐：产品经理负责需求梳理，技术架构师负责可行性评估。",
};

const RECOMMEND_PROMPT = `你是一个专家组合推荐助手。根据项目标题和描述，从可用专家列表中推荐最适合的2-4位专家组合。

可用专家列表：
{expertList}

请返回JSON格式：
{"expertIds":["expert-id-1","expert-id-2"],"reasoning":"推荐理由..."}

规则：
1. 推荐2-4位专家，覆盖不同视角
2. reasoning 简洁说明为什么这个组合适合该话题
3. expertIds 必须从可用专家列表中选择
4. 只返回JSON，不要其他文本`;

/**
 * 根据项目标题和描述推荐专家组合
 *
 * @param model LLM 模型
 * @param title 项目标题
 * @param description 项目描述（可选）
 * @returns 推荐结果（expertIds + reasoning）
 */
export async function recommendExpertCombination(
  model: LanguageModel,
  title: string,
  description?: string
): Promise<ExpertRecommendationResult> {
  try {
    const experts = await getAllExperts();
    if (experts.length === 0) {
      return DEFAULT_RECOMMENDATION;
    }

    const expertList = experts
      .map((e) => `- ${e.id}: ${e.name}（${e.focus}）`)
      .join("\n");

    const prompt = description
      ? `项目标题：${title}\n项目描述：${description}\n\n请推荐最适合的专家组合。`
      : `项目标题：${title}\n\n请推荐最适合的专家组合。`;

    const systemPrompt = RECOMMEND_PROMPT.replace("{expertList}", expertList);

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt,
      ...DEFAULT_CALL_SETTINGS,
    });

    const text = result.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return DEFAULT_RECOMMENDATION;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ExpertRecommendationResult>;
    if (!parsed.expertIds || !Array.isArray(parsed.expertIds)) {
      return DEFAULT_RECOMMENDATION;
    }

    // 过滤无效 expertId
    const validIds = new Set(experts.map((e) => e.id));
    let filteredIds = parsed.expertIds.filter(
      (id): id is string => typeof id === "string" && validIds.has(id)
    );

    // 补足到至少 2 位
    if (filteredIds.length < 2) {
      for (const expert of experts) {
        if (!filteredIds.includes(expert.id)) {
          filteredIds.push(expert.id);
          if (filteredIds.length >= 2) break;
        }
      }
    }

    // 截断到最多 4 位
    filteredIds = filteredIds.slice(0, 4);

    return {
      expertIds: filteredIds,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : DEFAULT_RECOMMENDATION.reasoning,
    };
  } catch {
    return DEFAULT_RECOMMENDATION;
  }
}
