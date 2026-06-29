/**
 * GET /api/v1/llm-stats
 * 获取 LLM 调用统计信息
 */

import { NextResponse } from "next/server";
import { getLLMStats } from "@/lib/llm-logger";

export async function GET() {
  try {
    const stats = await getLLMStats(20);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("获取 LLM 统计失败:", error);
    return NextResponse.json(
      { error: "获取统计数据失败" },
      { status: 500 }
    );
  }
}
