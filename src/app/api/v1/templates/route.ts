import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getExpertsByIds } from "@/lib/experts/definitions";

/**
 * GET /api/v1/templates
 * 获取所有项目模板（内置在前，再按创建时间正序）
 */
export async function GET() {
  try {
    const templates = await prisma.projectTemplate.findMany({
      orderBy: [{ isBuiltin: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("获取模板列表失败:", error);
    return NextResponse.json(
      { error: "获取模板列表失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/templates
 * 创建自定义项目模板
 * - name 非空
 * - expertIds 为数组且 length >= 2
 * - 所有专家 ID 必须在内置专家中存在
 * - isBuiltin 强制为 false
 * - expertIds 以 JSON 字符串存储
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, title, expertIds, phase } = body as {
      name?: string;
      description?: string;
      title?: string;
      expertIds?: string[];
      phase?: string;
    };

    // 校验模板名称非空
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "模板名称不能为空" },
        { status: 400 }
      );
    }

    // 校验专家 ID：必须是数组且至少 2 位
    if (!Array.isArray(expertIds) || expertIds.length < 2) {
      return NextResponse.json(
        { error: "至少需要选择 2 位专家" },
        { status: 400 }
      );
    }

    // 校验所有专家 ID 均存在
    const experts = await getExpertsByIds(expertIds);
    if (experts.length !== expertIds.length) {
      return NextResponse.json(
        { error: "包含无效的专家 ID" },
        { status: 400 }
      );
    }

    // 校验所有专家均为内置专家
    const nonBuiltin = experts.filter((e) => !e.isBuiltin);
    if (nonBuiltin.length > 0) {
      return NextResponse.json(
        { error: "模板仅支持引用内置专家" },
        { status: 400 }
      );
    }

    const created = await prisma.projectTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim() ?? "",
        title: title?.trim() ?? name.trim(),
        expertIds: JSON.stringify(expertIds),
        phase: phase?.trim() || "diverge",
        isBuiltin: false,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("创建模板失败:", error);
    return NextResponse.json(
      { error: "创建模板失败" },
      { status: 500 }
    );
  }
}
