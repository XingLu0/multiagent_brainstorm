import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/projects/[id]
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
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("获取项目详情失败:", error);
    return NextResponse.json(
      { error: "获取项目详情失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
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
