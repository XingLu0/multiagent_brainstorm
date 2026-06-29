import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerSoftStop } from "@/lib/engine/soft-stop-registry";

/**
 * POST /api/v1/sessions/[id]/soft-stop
 * 触发软停止：当前专家说完后不再继续下一轮讨论。
 *
 * 与强制停止（abort）不同，软停止不会中断当前专家的流式输出，
 * 而是等待当前专家完成后自然结束讨论。
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 验证项目存在且处于活跃状态
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json(
      { error: "项目不存在" },
      { status: 404 }
    );
  }
  if (project.status !== "active") {
    return NextResponse.json(
      { error: "该项目已结束，无法执行软停止" },
      { status: 400 }
    );
  }

  // 从注册表查找正在运行的讨论 Actor 并发送 SOFT_STOP
  const triggered = triggerSoftStop(id);
  if (!triggered) {
    return NextResponse.json(
      { error: "当前没有进行中的讨论，无法软停止" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
