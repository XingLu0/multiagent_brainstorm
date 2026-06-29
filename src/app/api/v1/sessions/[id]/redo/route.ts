import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redo } from "@/lib/engine/undo-redo-manager";

/**
 * POST /api/v1/sessions/[id]/redo
 *
 * 重做到下一条消息。
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const result = await redo(id);
  if (!result) {
    return NextResponse.json({ error: "无法重做" }, { status: 400 });
  }

  return NextResponse.json(result);
}
