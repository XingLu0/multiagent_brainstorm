import { NextResponse } from "next/server";
import { createSSEResponse } from "@/lib/sse";
import { createEngineFromRequest } from "@/lib/server-config";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/sessions/[id]/mindmap
 * 基于会议纪要生成思维导图，返回 SSE 流
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 查找纪要
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      documents: {
        where: { docType: "minutes" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  if (project.documents.length === 0) {
    return NextResponse.json({ error: "请先生成会议纪要" }, { status: 400 });
  }

  return createSSEResponse(async (send) => {
    const engine = createEngineFromRequest(request);
    await engine.generateMindmap(
      id,
      {
        onMindmap: (chunk) => send("mindmap", { content: chunk }),
        onError: (message) => send("error", { message, retryable: true }),
      },
      request.signal
    );
  });
}
