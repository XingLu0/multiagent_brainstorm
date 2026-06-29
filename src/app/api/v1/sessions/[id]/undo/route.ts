import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { undo, getUndoRedoState } from "@/lib/engine/undo-redo-manager";

/**
 * GET /api/v1/sessions/[id]/undo
 *
 * DEF-05: 查询当前撤销/重做状态（不执行撤销操作）。
 * 返回 { currentSeq, totalMessages, canUndo, canRedo }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const state = await getUndoRedoState(id);
  return NextResponse.json(state);
}

/**
 * POST /api/v1/sessions/[id]/undo
 *
 * 撤销到上一条消息。
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

  const result = await undo(id);
  if (!result) {
    return NextResponse.json({ error: "无法撤销" }, { status: 400 });
  }

  return NextResponse.json(result);
}
