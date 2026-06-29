import { NextResponse } from "next/server";
import { createEngineFromRequest } from "@/lib/server-config";

/**
 * PATCH /api/v1/sessions/[id]/phase
 * 讨论阶段切换：将发散（diverge）阶段切换为收敛（converge）阶段。
 *
 * 请求体：{ phase: "converge" }
 * 返回：{ success: true, phase: "converge" }
 *
 * 校验规则（详见 engine.handlePhaseTransition）：
 * - 项目必须存在且处于 active 状态
 * - 当前阶段不能与目标阶段相同
 * - 当前阶段不能为 concluded（已结束）
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let phase: string;
  try {
    const body = await request.json();
    phase = body.phase;
  } catch {
    return NextResponse.json(
      { error: "无效的请求体" },
      { status: 400 }
    );
  }

  // 校验：当前仅支持切换到收敛阶段
  if (phase !== "converge") {
    return NextResponse.json(
      { error: "仅支持切换到收敛阶段" },
      { status: 400 }
    );
  }

  try {
    const engine = createEngineFromRequest(request);
    await engine.handlePhaseTransition(id, "converge");
    return NextResponse.json({ success: true, phase });
  } catch (e) {
    const message = e instanceof Error ? e.message : "操作失败";
    // 根据已知错误信息映射合适的 HTTP 状态码
    const status = message.includes("不存在") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
