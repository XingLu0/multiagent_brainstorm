import { NextResponse } from "next/server";
import { createEngineFromRequest } from "@/lib/server-config";

/**
 * POST /api/v1/sessions/[id]/intervene
 * 用户干预指令：将以 / 开头的方向性干预持久化为 intervene 类型消息。
 *
 * 与 /message 不同，此接口不触发主持人引导与专家回应（非 SSE），
 * 仅持久化指令，供下一轮专家讨论时注入【用户干预指令】段落。
 *
 * 请求体：{ directive: string }
 * 返回：{ success: true }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 解析请求体
  let directive: string;
  try {
    const body = await request.json();
    directive = body.directive;
  } catch {
    return NextResponse.json(
      { error: "无效的请求体" },
      { status: 400 }
    );
  }

  // 校验：directive 必须是非空字符串
  if (typeof directive !== "string" || directive.trim().length === 0) {
    return NextResponse.json(
      { error: "干预指令不能为空" },
      { status: 400 }
    );
  }

  try {
    const engine = createEngineFromRequest(request);
    // 持久化干预消息，不触发专家讨论流程
    await engine.handleIntervene(id, directive.trim(), request.signal);
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "处理干预指令失败";
    // 根据已知错误信息映射合适的 HTTP 状态码
    const status = message.includes("不存在")
      ? 404
      : message.includes("已结束")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
