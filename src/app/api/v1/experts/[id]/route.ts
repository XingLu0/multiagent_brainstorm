import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidAvatarColor } from "@/lib/experts/types";

/**
 * PUT /api/v1/experts/[id]
 * 更新专家角色（仅自定义专家可更新）
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 检查专家是否存在
    const existing = await prisma.expertDefinition.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "专家不存在" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, persona, focus, avatarColor } = body as {
      name?: string;
      persona?: string;
      focus?: string;
      avatarColor?: string;
    };

    // 构建更新数据（只更新提供的字段）
    const updateData: Record<string, string> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "专家名称不能为空" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    if (persona !== undefined) {
      if (typeof persona !== "string" || persona.trim().length === 0) {
        return NextResponse.json(
          { error: "专家人设不能为空" },
          { status: 400 }
        );
      }
      updateData.persona = persona.trim();
    }
    if (focus !== undefined) {
      updateData.focus = focus.trim();
    }
    if (avatarColor !== undefined) {
      updateData.avatarColor = isValidAvatarColor(avatarColor)
        ? avatarColor
        : "emerald";
    }

    const updated = await prisma.expertDefinition.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("更新专家失败:", error);
    return NextResponse.json(
      { error: "更新专家失败" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/experts/[id]
 * 删除专家角色（仅自定义专家可删除，且未被项目引用）
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 检查专家是否存在
    const existing = await prisma.expertDefinition.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "专家不存在" },
        { status: 404 }
      );
    }

    // 内置专家不可删除
    if (existing.isBuiltin) {
      return NextResponse.json(
        { error: "内置专家不可删除" },
        { status: 403 }
      );
    }

    // 检查是否被项目引用
    const inUse = await prisma.project.findFirst({
      where: { expertIds: { contains: id } },
      select: { id: true, title: true },
    });
    if (inUse) {
      return NextResponse.json(
        { error: `该专家仍被项目「${inUse.title}」使用，无法删除` },
        { status: 409 }
      );
    }

    await prisma.expertDefinition.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除专家失败:", error);
    return NextResponse.json(
      { error: "删除专家失败" },
      { status: 500 }
    );
  }
}
