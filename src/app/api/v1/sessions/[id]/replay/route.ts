import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getReplayMessages } from "@/lib/engine/undo-redo-manager";

/**
 * GET /api/v1/sessions/[id]/replay?seq=N
 *
 * 获取讨论回放视图（只读，不修改 currentSeq）。
 * 不传 seq 返回全部消息，传 seq 返回 seq <= N 的消息。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  const url = new URL(request.url);
  const seqParam = url.searchParams.get("seq");
  const seq = seqParam ? parseInt(seqParam, 10) : undefined;

  if (seq !== undefined && (isNaN(seq) || seq < 0)) {
    return NextResponse.json({ error: "无效的 seq 参数" }, { status: 400 });
  }

  const result = await getReplayMessages(id, seq);
  return NextResponse.json(result);
}
