import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/v1/projects/[id]
 * 获取单个项目详情（包含消息和文档）
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { seq: "asc" },
        },
        documents: {
          orderBy: { createdAt: "desc" },
        },
        knowledgeEntries: {
          select: { category: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    // 按 category 分组统计知识库条目，供状态看板展示共识/分歧计数
    const knowledgeCounts = project.knowledgeEntries.reduce(
      (acc, entry) => {
        if (entry.category === "consensus") acc.consensus += 1;
        else if (entry.category === "divergence") acc.divergence += 1;
        return acc;
      },
      { consensus: 0, divergence: 0 }
    );

    // 移除中间统计用的明细列表，避免响应体膨胀
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { knowledgeEntries, ...rest } = project;

    return NextResponse.json({ ...rest, knowledgeCounts });
  } catch (error) {
    console.error("获取项目详情失败:", error);
    return NextResponse.json(
      { error: "获取项目详情失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/projects/[id]
 * 删除项目（级联删除关联的消息和文档）
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    // Prisma schema 中已配置 onDelete: Cascade，删除项目会自动级联删除消息和文档
    await prisma.project.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除项目失败:", error);
    return NextResponse.json(
      { error: "删除项目失败" },
      { status: 500 }
    );
  }
}
