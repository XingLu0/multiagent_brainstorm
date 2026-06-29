import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeExpertStats } from "@/lib/expert-stats";

/**
 * GET /api/v1/experts/[id]/stats
 *
 * 返回专家跨项目统计数据。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. 查询专家信息
  const expert = await prisma.expertDefinition.findUnique({ where: { id } });
  if (!expert) {
    return NextResponse.json({ error: "专家不存在" }, { status: 404 });
  }

  // 2. 查询该专家参与的所有项目消息
  const expertMessages = await prisma.message.findMany({
    where: { role: `expert:${id}` },
    select: { projectId: true, content: true },
  });

  // 3. 查询相关项目的知识条目统计
  const projectIds = [...new Set(expertMessages.map((m) => m.projectId))];
  const knowledgeEntries = await prisma.knowledgeEntry.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, category: true },
  });

  // 按项目+类别分组计数
  const knowledgeCountMap = new Map<string, number>();
  for (const entry of knowledgeEntries) {
    const key = `${entry.projectId}:${entry.category}`;
    knowledgeCountMap.set(key, (knowledgeCountMap.get(key) ?? 0) + 1);
  }
  const knowledgeCounts = Array.from(knowledgeCountMap.entries()).map(([key, count]) => {
    const [projectId, category] = key.split(":");
    return { projectId, category, count };
  });

  // 4. 查询项目信息
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, title: true },
  });

  // 5. 计算统计数据
  const stats = computeExpertStats(
    id,
    expert.name,
    expertMessages,
    knowledgeCounts,
    projects
  );

  return NextResponse.json(stats);
}
