import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getExpertsByIds } from "@/lib/experts/definitions";

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
 * PUT /api/v1/templates/[id]
 * 更新自定义项目模板（内置模板不可编辑）
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, title, expertIds, phase } = body as {
      name?: string;
      description?: string;
      title?: string;
      expertIds?: string[];
      phase?: string;
    };

    const existing = await prisma.projectTemplate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "模板不存在" }, { status: 404 });
    }
    if (existing.isBuiltin) {
      return NextResponse.json({ error: "内置模板不可编辑" }, { status: 403 });
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "模板名称不能为空" }, { status: 400 });
    }
    if (!Array.isArray(expertIds) || expertIds.length < 2) {
      return NextResponse.json({ error: "至少需要选择 2 位专家" }, { status: 400 });
    }
    const experts = await getExpertsByIds(expertIds);
    if (experts.length !== expertIds.length) {
      return NextResponse.json({ error: "包含无效的专家 ID" }, { status: 400 });
    }
    const nonBuiltin = experts.filter((e) => !e.isBuiltin);
    if (nonBuiltin.length > 0) {
      return NextResponse.json({ error: "模板仅支持引用内置专家" }, { status: 400 });
    }

    const updated = await prisma.projectTemplate.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description?.trim() ?? "",
        title: title?.trim() ?? name.trim(),
        expertIds: JSON.stringify(expertIds),
        phase: phase?.trim() || "diverge",
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("更新模板失败:", error);
    return NextResponse.json({ error: "更新模板失败" }, { status: 500 });
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
