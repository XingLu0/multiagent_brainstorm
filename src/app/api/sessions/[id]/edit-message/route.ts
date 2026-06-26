import { NextResponse } from "next/server";
import { createSSEResponse } from "@/lib/sse";
import { createEngineFromRequest } from "@/lib/server-config";

/**
 * POST /api/sessions/[id]/edit-message
 * 编辑用户消息：删除后续消息 → 更新内容 → 重新生成（主持人引导 + 专家回应）
 * 返回 SSE 流
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 解析请求体
  let body: { messageId?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "无效的请求体" },
      { status: 400 }
    );
  }

  const { messageId, content } = body;

  // 验证参数
  if (!messageId || typeof messageId !== "string") {
    return NextResponse.json(
      { error: "messageId 不能为空" },
      { status: 400 }
    );
  }
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "消息内容不能为空" },
      { status: 400 }
    );
  }

  return createSSEResponse(async (send) => {
    const engine = createEngineFromRequest(request);
    await engine.handleEditedMessage(id, messageId, content.trim(), {
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
