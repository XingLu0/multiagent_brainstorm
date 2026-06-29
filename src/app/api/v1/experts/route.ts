import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllExperts } from "@/lib/experts/definitions";
import { isValidAvatarColor } from "@/lib/experts/types";

/**
 * GET /api/v1/experts
 * 获取所有专家（内置 + 自定义）
 */
export async function GET() {
  try {
    const experts = await getAllExperts();
    return NextResponse.json(experts);
  } catch (error) {
    console.error("获取专家列表失败:", error);
    return NextResponse.json(
      { error: "获取专家列表失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/experts
 * 创建自定义专家角色
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, persona, focus, avatarColor } = body as {
      name?: string;
      persona?: string;
      focus?: string;
      avatarColor?: string;
    };

    // 校验必填字段
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "专家名称不能为空" },
        { status: 400 }
      );
    }
    if (!persona || typeof persona !== "string" || persona.trim().length === 0) {
      return NextResponse.json(
        { error: "专家人设不能为空" },
        { status: 400 }
      );
    }

    // 校验配色（支持预设色名和 HEX 颜色）
    const color = avatarColor && isValidAvatarColor(avatarColor)
      ? avatarColor
      : "emerald";

    const created = await prisma.expertDefinition.create({
      data: {
        name: name.trim(),
        persona: persona.trim(),
        focus: focus?.trim() || "",
        avatarColor: color,
        isBuiltin: false,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("创建专家失败:", error);
    return NextResponse.json(
      { error: "创建专家失败" },
      { status: 500 }
    );
  }
}
