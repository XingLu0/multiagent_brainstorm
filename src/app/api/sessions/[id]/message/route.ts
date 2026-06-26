import { NextResponse } from "next/server";
import { createSSEResponse } from "@/lib/sse";
import { createEngineFromRequest } from "@/lib/server-config";

/**
 * POST /api/sessions/[id]/message
 * 发送用户消息，返回 SSE 流（主持人引导 + 专家回应）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 解析请求体
  let content: string;
  try {
    const body = await request.json();
    content = body.content;
  } catch {
    return NextResponse.json(
      { error: "无效的请求体" },
      { status: 400 }
    );
  }

  // 验证消息内容
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "消息内容不能为空" },
      { status: 400 }
    );
  }

  return createSSEResponse(async (send) => {
    const engine = createEngineFromRequest(request);
    await engine.handleUserMessage(id, content, {
      onHost: (chunk, expertIds) => {
        send("host", { content: chunk, expertIds });
      },
      onExpertStart: (expertId, round) => {
        send("expert_start", { expertId, round });
      },
      onExpert: (chunk, expertId, round) => {
        send("expert", { content: chunk, expertId, round });
      },
      onSummary: (chunk) => {
        send("summary", { content: chunk });
      },
      onToolCall: (expertId, toolName, input) => {
        send("tool_call", { expertId, toolName, input });
      },
      onError: (message) => {
        send("error", { message, retryable: true });
      },
    }, request.signal);
  });
}
