import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/v1/templates/[id]
 * 获取单个项目模板
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const template = await prisma.projectTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(
        { error: "模板不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("获取模板详情失败:", error);
    return NextResponse.json(
      { error: "获取模板详情失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/templates/[id]
 * 删除项目模板（内置模板不可删除）
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.projectTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "模板不存在" },
        { status: 404 }
      );
    }

    // 内置模板不可删除
    if (existing.isBuiltin) {
      return NextResponse.json(
        { error: "内置模板不可删除" },
        { status: 403 }
      );
    }

    await prisma.projectTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除模板失败:", error);
    return NextResponse.json(
      { error: "删除模板失败" },
      { status: 500 }
    );
  }
}
