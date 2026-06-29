/**
 * P3-1: 撤销/重做 + 讨论回放
 *
 * 基于 currentSeq 指针实现消息级别的撤销/重做。
 * currentSeq=0 表示最新位置，>0 表示已撤销到对应 seq。
 * 回放为只读模式，不修改 currentSeq。
 */

import { prisma } from "@/lib/prisma";

/**
 * 撤销：currentSeq 回退到上一条消息
 *
 * @returns 撤销后的状态信息，或 null（无法撤销）
 */
export async function undo(projectId: string): Promise<{
  currentSeq: number;
  totalMessages: number;
  canUndo: boolean;
  canRedo: boolean;
} | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentSeq: true },
  });
  if (!project) return null;

  // 查询最大 seq
  const lastMessage = await prisma.message.findFirst({
    where: { projectId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  if (!lastMessage) return null;

  const maxSeq = lastMessage.seq;
  // 只有一条消息时无法撤销
  if (maxSeq < 2) return null;

  // currentSeq=0 表示在最新位置，撤销到 maxSeq-1
  // currentSeq>0 表示已在历史位置，撤销到 currentSeq-1
  const newSeq = project.currentSeq === 0 ? maxSeq - 1 : project.currentSeq - 1;

  // 已在最早位置（seq=1）
  if (newSeq < 1) return null;

  await prisma.project.update({
    where: { id: projectId },
    data: { currentSeq: newSeq },
  });

  return {
    currentSeq: newSeq,
    totalMessages: maxSeq,
    canUndo: newSeq > 1,
    canRedo: true,
  };
}

/**
 * 重做：currentSeq 前进到下一条消息
 *
 * @returns 重做后的状态信息，或 null（无法重做）
 */
export async function redo(projectId: string): Promise<{
  currentSeq: number;
  totalMessages: number;
  canUndo: boolean;
  canRedo: boolean;
} | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentSeq: true },
  });
  if (!project) return null;

  // currentSeq=0 表示在最新位置，无法重做
  if (project.currentSeq === 0) return null;

  // 查询最大 seq
  const lastMessage = await prisma.message.findFirst({
    where: { projectId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  if (!lastMessage) return null;

  const maxSeq = lastMessage.seq;
  const newSeq = project.currentSeq + 1;

  // 到达最新位置，重置为 0
  if (newSeq >= maxSeq) {
    await prisma.project.update({
      where: { id: projectId },
      data: { currentSeq: 0 },
    });
    return {
      currentSeq: 0,
      totalMessages: maxSeq,
      canUndo: true,
      canRedo: false,
    };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { currentSeq: newSeq },
  });

  return {
    currentSeq: newSeq,
    totalMessages: maxSeq,
    canUndo: true,
    canRedo: true,
  };
}

/**
 * 获取当前撤销/重做状态
 */
export async function getUndoRedoState(projectId: string): Promise<{
  currentSeq: number;
  totalMessages: number;
  canUndo: boolean;
  canRedo: boolean;
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentSeq: true },
  });

  const lastMessage = await prisma.message.findFirst({
    where: { projectId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });

  const currentSeq = project?.currentSeq ?? 0;
  const totalMessages = lastMessage?.seq ?? 0;

  return {
    currentSeq,
    totalMessages,
    canUndo: totalMessages >= 2 && (currentSeq > 1 || currentSeq === 0 && totalMessages >= 2),
    canRedo: currentSeq > 0,
  };
}

/**
 * 获取回放视图（只读，不修改 currentSeq）
 *
 * @param projectId 项目 ID
 * @param seq 截止 seq（返回 seq <= 此值的消息），不传则返回全部
 */
export async function getReplayMessages(
  projectId: string,
  seq?: number
): Promise<{
  messages: Array<{
    id: string;
    role: string;
    content: string;
    seq: number;
    createdAt: string;
    metadata?: string | null;
  }>;
  totalMessages: number;
  currentSeq: number;
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentSeq: true },
  });

  const where = seq
    ? { projectId, seq: { lte: seq } }
    : { projectId };

  const messages = await prisma.message.findMany({
    where,
    orderBy: { seq: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      seq: true,
      createdAt: true,
      metadata: true,
    },
  });

  const lastMessage = await prisma.message.findFirst({
    where: { projectId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });

  return {
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
    totalMessages: lastMessage?.seq ?? 0,
    currentSeq: project?.currentSeq ?? 0,
  };
}
