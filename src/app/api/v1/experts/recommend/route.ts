import { NextResponse } from "next/server";
import { resolveConfigFromRequest } from "@/lib/server-config";
import { createLLMModel } from "@/lib/llm";
import { recommendExpertCombination } from "@/lib/engine/recommender";

/**
 * POST /api/v1/experts/recommend
 *
 * 根据项目标题和描述智能推荐专家组合。
 *
 * Body: { title: string, description?: string }
 * Response: { expertIds: string[], reasoning: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "请提供项目标题" },
        { status: 400 }
      );
    }

    const config = resolveConfigFromRequest(request);
    const model = createLLMModel(config);

    const result = await recommendExpertCombination(
      model,
      title.trim(),
      description?.trim()
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[experts/recommend] Error:", error);
    return NextResponse.json(
      { error: "推荐失败，请稍后重试" },
      { status: 500 }
    );
  }
}
