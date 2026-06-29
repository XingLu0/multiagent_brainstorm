import { NextResponse } from "next/server";
import { createSSEResponse } from "@/lib/sse";
import { createEngineFromRequest } from "@/lib/server-config";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/v1/sessions/[id]/continue
 * 继续被暂停的专家讨论，返回 SSE 流（专家回应 + 可能的再次暂停）
 * 请求体可选：{ userInput?: string } — 用户补充的偏好或信息
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 解析请求体（userInput 可选）
  let userInput: string | null = null;
  try {
    const body = await request.json();
    userInput = body.userInput ?? null;
  } catch {
    // 无请求体或无效 JSON — 不带用户输入直接继续
  }

  // 校验：若提供了 userInput，必须是非空字符串
  if (userInput !== null) {
    if (typeof userInput !== "string" || userInput.trim().length === 0) {
      userInput = null;
    } else {
      userInput = userInput.trim();
    }
  }

  // 路由层预检：确认暂停点存在（引擎层也有校验，此处返回干净 HTTP 400）
  const pauseExists = await prisma.message.findFirst({
    where: { projectId: id, role: "pause" },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  if (!pauseExists) {
    return NextResponse.json(
      { error: "未找到暂停点，无法继续讨论" },
      { status: 400 }
    );
  }

  return createSSEResponse(async (send) => {
    const engine = createEngineFromRequest(request);
    await engine.handleContinueDiscussion(id, userInput, {
      onExpertStart: (expertId, round) => {
        send("expert_start", { expertId, round });
      },
      onExpert: (chunk, expertId, round) => {
        send("expert", { content: chunk, expertId, round });
      },
      onPause: (chunk, remainingTurns) => {
        send("pause", { content: chunk, remainingTurns });
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
    }, request.signal);
  });
}
