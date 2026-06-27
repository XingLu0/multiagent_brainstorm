import { NextResponse } from "next/server";
import { createEngineFromRequest } from "@/lib/server-config";

/**
 * PATCH /api/sessions/[id]/experts
 * 动态专家管理：讨论过程中邀请新专家或临时移除已有专家。
 *
 * 请求体：{ action: "add" | "remove", expertId: string }
 * 返回：{ success: true, expertIds: string[] }
 *
 * 校验规则（详见 engine.handleExpertChange）：
 * - expertId 存在性检查
 * - action="add"：专家不在当前 expertIds 中
 * - action="remove"：专家在当前 expertIds 中，且移除后至少保留 1 位专家
 * - 轮次限制：仅前 3 轮（turnCount < 3）允许变更
 * - 每轮最多 1 次变更：检查当前轮次是否已有 expert_change 类型的 system 消息
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 解析请求体
  let action: "add" | "remove";
  let expertId: string;
  try {
    const body = await request.json();
    action = body.action;
    expertId = body.expertId;
  } catch {
    return NextResponse.json(
      { error: "无效的请求体" },
      { status: 400 }
    );
  }

  // 校验：action 必须是 add 或 remove
  if (action !== "add" && action !== "remove") {
    return NextResponse.json(
      { error: "action 必须为 add 或 remove" },
      { status: 400 }
    );
  }

  // 校验：expertId 必须是非空字符串
  if (typeof expertId !== "string" || expertId.trim().length === 0) {
    return NextResponse.json(
      { error: "expertId 不能为空" },
      { status: 400 }
    );
  }

  try {
    const engine = createEngineFromRequest(request);
    // 执行专家变更（含全部业务校验）
    const expertIds = await engine.handleExpertChange(
      id,
      action,
      expertId.trim()
    );
    return NextResponse.json({ success: true, expertIds });
  } catch (e) {
    const message = e instanceof Error ? e.message : "专家变更失败";
    // 根据已知错误信息映射合适的 HTTP 状态码
    const status = message.includes("不存在")
      ? 404
      : message.includes("已结束") ||
          message.includes("不允许") ||
          message.includes("本轮") ||
          message.includes("已在") ||
          message.includes("不在") ||
          message.includes("至少") ||
          message.includes("已进入")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
