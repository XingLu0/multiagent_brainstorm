import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getExpertsByIds } from "@/lib/experts/definitions";

/**
 * GET /api/v1/projects
 * 获取所有项目列表（按创建时间倒序，包含消息数量）
 */
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error("获取项目列表失败:", error);
    return NextResponse.json(
      { error: "获取项目列表失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/projects
 * 创建新项目（包含初始主持人欢迎消息）
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, expertIds } = body as {
      title: string;
      expertIds: string[];
    };

    // 验证标题：非空且不超过 200 字符
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "项目标题不能为空" },
        { status: 400 }
      );
    }
    if (title.trim().length > 200) {
      return NextResponse.json(
        { error: "项目标题不能超过 200 个字符" },
        { status: 400 }
      );
    }

    // 验证专家：至少 2 位
    if (!Array.isArray(expertIds) || expertIds.length < 2) {
      return NextResponse.json(
        { error: "至少需要选择 2 位专家" },
        { status: 400 }
      );
    }

    // 验证专家 ID 全部有效
    const experts = await getExpertsByIds(expertIds);
    if (experts.length !== expertIds.length) {
      return NextResponse.json(
        { error: "包含无效的专家 ID" },
        { status: 400 }
      );
    }

    const trimmedTitle = title.trim();

    // 创建项目，同时创建初始主持人欢迎消息
    const project = await prisma.project.create({
      data: {
        title: trimmedTitle,
        expertIds: JSON.stringify(expertIds),
        messages: {
          create: {
            role: "host",
            content: `欢迎来到「${trimmedTitle}」脑暴会议！我是本次讨论的主持人。请分享你的想法或问题，我将引导各位专家从不同角度为你提供深入分析。`,
            seq: 1,
          },
        },
      },
      include: {
        messages: {
          orderBy: { seq: "asc" },
        },
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("创建项目失败:", error);
    return NextResponse.json(
      { error: "创建项目失败" },
      { status: 500 }
    );
  }
}
