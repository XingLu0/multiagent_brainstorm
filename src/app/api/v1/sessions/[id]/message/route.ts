import { NextResponse } from "next/server";
import { createSSEResponse } from "@/lib/sse";
import { createEngineFromRequest } from "@/lib/server-config";

/**
 * POST /api/v1/sessions/[id]/message
 * 发送用户消息，返回 SSE 流（主持人引导 + 专家回应）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 解析请求体（支持可选的附件列表）
  let content: string;
  let attachments: { name: string; type: string; text: string }[] | undefined;
  try {
    const body = await request.json();
    content = body.content;
    attachments = body.attachments;
  } catch {
    return NextResponse.json(
      { error: "无效的请求体" },
      { status: 400 }
    );
  }

  // 验证消息内容（允许空文本但要求有附件，或两者皆有）
  const hasContent = content && typeof content === "string" && content.trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!hasContent && !hasAttachments) {
    return NextResponse.json(
      { error: "消息内容不能为空" },
      { status: 400 }
    );
  }

  return createSSEResponse(async (send) => {
    const engine = createEngineFromRequest(request);
    await engine.handleUserMessage(id, hasContent ? content : "", {
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
      onSoftStop: () => {
        send("stopping", {});
      },
      onSoftStopComplete: () => {
        send("soft_stop", {});
      },
      onError: (message) => {
        send("error", { message, retryable: true });
      },
    }, request.signal, attachments);
  });
}
