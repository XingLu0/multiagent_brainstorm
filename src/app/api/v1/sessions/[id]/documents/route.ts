import { NextResponse } from "next/server";
import { createSSEResponse } from "@/lib/sse";
import { createEngineFromRequest } from "@/lib/server-config";
import type { DocumentType } from "@/lib/engine/doc-types";
import { VALID_DOC_TYPES } from "@/lib/engine/doc-types";

/**
 * POST /api/v1/sessions/[id]/documents
 * 生成文档草稿（PRD/SPEC/用户故事地图/技术方案/市场分析报告/行动计划），返回 SSE 流
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 解析请求体
  let body: { type: DocumentType; content: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "无效的请求体" },
      { status: 400 }
    );
  }

  const { type, content } = body;

  // 验证文档类型
  if (!VALID_DOC_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "无效的文档类型" },
      { status: 400 }
    );
  }

  // 验证内容长度（至少 50 字符）
  if (!content || typeof content !== "string" || content.trim().length < 50) {
    return NextResponse.json(
      { error: "内容长度至少需要 50 个字符" },
      { status: 400 }
    );
  }

  return createSSEResponse(async (send) => {
    const engine = createEngineFromRequest(request);
    await engine.generateDocument(id, type, content, {
      onDocument: (docContent) => {
        send("document", { content: docContent });
      },
    }, request.signal);
  });
}
