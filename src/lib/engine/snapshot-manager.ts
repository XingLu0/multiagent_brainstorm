/**
 * 快照管理器
 *
 * 负责讨论状态的持久化快照，优化长讨论的状态重建性能。
 * 每 SNAPSHOT_INTERVAL 条消息自动创建快照，重建时加载最新快照 + 重放增量消息。
 */

import { prisma } from "@/lib/prisma";
import { SNAPSHOT_INTERVAL } from "./constants";
import type { DiscussionState } from "./discussion-state";

/**
 * 判断是否应该创建快照
 * 条件：seq > 0 且 seq 是 SNAPSHOT_INTERVAL 的倍数
 */
export function shouldCreateSnapshot(seq: number): boolean {
  return seq > 0 && seq % SNAPSHOT_INTERVAL === 0;
}

/**
 * 保存快照到数据库
 *
 * @param projectId 项目 ID
 * @param seq 当前消息的 seq 值
 * @param state 讨论状态（将序列化为 JSON 存储）
 */
export async function saveSnapshot(
  projectId: string,
  seq: number,
  state: DiscussionState
): Promise<void> {
  await prisma.stateSnapshot.create({
    data: {
      projectId,
      seq,
      state: JSON.stringify(state),
    },
  });
}

/**
 * 加载最新的有效快照
 *
 * @param projectId 项目 ID
 * @param maxSeq 最大 seq（仅加载 seq <= maxSeq 的快照），可选
 * @returns 快照数据（含 seq 和反序列化的 state），无则返回 null
 */
export async function loadLatestSnapshot(
  projectId: string,
  maxSeq?: number
): Promise<{ seq: number; state: DiscussionState } | null> {
  const where: { projectId: string; seq?: { lte: number } } = { projectId };
  if (maxSeq !== undefined) {
    where.seq = { lte: maxSeq };
  }

  const snapshot = await prisma.stateSnapshot.findFirst({
    where,
    orderBy: { seq: "desc" },
  });

  if (!snapshot) return null;

  try {
    const state = JSON.parse(snapshot.state) as DiscussionState;
    return { seq: snapshot.seq, state };
  } catch {
    // JSON 解析失败，返回 null 回退全量重建
    return null;
  }
}
