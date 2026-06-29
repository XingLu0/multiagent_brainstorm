/**
 * 讨论状态可视化：从消息历史重建看板状态
 *
 * 该模块为纯函数，不依赖 prisma，可在客户端组件中使用。
 * 状态重建逻辑与 BrainstormEngine 的消息持久化结构保持一致：
 * - expert:* 消息 metadata: { expertId, round }
 * - pause 消息 metadata: { type, completedTurns, totalTurns, activeExpertIds, ... }
 * - host 消息 metadata: { designatedExpertIds }
 */

import type { ExpertDefinition } from "@/lib/experts/types";

/**
 * 专家最大讨论轮次（与 BrainstormEngine.MAX_EXPERT_ROUNDS 保持一致）
 */
export const MAX_EXPERT_ROUNDS = 5;

export interface ExpertState {
  id: string;
  name: string;
  avatarColor: string;
  spoken: boolean; // 当前轮次已发言
  speaking: boolean; // 当前正在发言
}

export type DiscussionPhase =
  | "idle"
  | "hosting"
  | "discussing"
  | "paused"
  | "summarizing"
  | "completed";

export interface DiscussionState {
  phase: DiscussionPhase;
  currentRound: number; // 0-indexed
  maxRounds: number; // 固定 5（MAX_EXPERT_ROUNDS）
  totalTurns: number;
  completedTurns: number;
  activeExperts: ExpertState[];
  divergences: number; // 来自 KnowledgeEntry
  consensus: number;
}

/**
 * 用于重建状态的精简消息结构（与持久化消息字段对齐）
 */
interface RebuildMessage {
  role: string;
  content: string;
  metadata?: string | null;
}

/**
 * 创建 idle 初始状态
 * 所有传入专家默认未发言、未在发言
 */
export function createInitialState(
  experts: ExpertDefinition[]
): DiscussionState {
  return {
    phase: "idle",
    currentRound: 0,
    maxRounds: MAX_EXPERT_ROUNDS,
    totalTurns: 0,
    completedTurns: 0,
    activeExperts: experts.map((e) => ({
      id: e.id,
      name: e.name,
      avatarColor: e.avatarColor,
      spoken: false,
      speaking: false,
    })),
    divergences: 0,
    consensus: 0,
  };
}

/**
 * 从 metadata JSON 字符串安全解析对象
 */
function parseMetadata(metadata?: string | null): Record<string, unknown> | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 从消息历史重建讨论状态
 *
 * @param messages 消息列表（按 seq 升序），字段 { role, content, metadata }
 * @param experts 当前可用的专家定义（用于补全名称/配色）
 * @param knowledgeCounts 知识库计数 { consensus, divergence }
 * @param isCompleted 项目是否已结束
 */
export function rebuildStateFromMessages(
  messages: RebuildMessage[],
  experts: ExpertDefinition[],
  knowledgeCounts: { consensus: number; divergence: number },
  isCompleted = false
): DiscussionState {
  let phase: DiscussionPhase = "idle";
  let currentRound = 0;
  let completedTurns = 0;
  let totalTurns = 0;

  // round -> 该轮已发言专家集合
  const expertsByRound = new Map<number, Set<string>>();
  // 最近一次 host 消息指定的专家列表
  let lastDesignatedExpertIds: string[] | undefined;

  for (const msg of messages) {
    if (msg.role.startsWith("expert:")) {
      const expertId = msg.role.slice(7);
      const meta = parseMetadata(msg.metadata);
      const round =
        meta && typeof meta.round === "number" ? meta.round : currentRound;
      if (!expertsByRound.has(round)) expertsByRound.set(round, new Set());
      expertsByRound.get(round)!.add(expertId);
      completedTurns++;
    } else if (msg.role === "host") {
      const meta = parseMetadata(msg.metadata);
      if (meta && Array.isArray(meta.designatedExpertIds)) {
        lastDesignatedExpertIds = meta.designatedExpertIds as string[];
      }
    }
  }

  // 根据已发言专家的 metadata.round 确定当前轮次
  if (expertsByRound.size > 0) {
    currentRound = Math.max(...expertsByRound.keys());
  }
  const spokenInCurrentRound = expertsByRound.get(currentRound) ?? new Set<string>();

  // 从 expert:* 消息中收集所有出现过的专家 id
  const expertMsgIds = new Set<string>();
  for (const set of expertsByRound.values()) {
    for (const id of set) expertMsgIds.add(id);
  }

  // 确定 activeExpertIds
  let activeExpertIds: string[] = [];

  // 检查最后一条消息是否为 pause
  const lastMsg = messages[messages.length - 1];
  if (lastMsg && lastMsg.role === "pause") {
    const pauseMeta = parseMetadata(lastMsg.metadata);
    if (pauseMeta) {
      phase = "paused";
      if (typeof pauseMeta.totalTurns === "number") {
        totalTurns = pauseMeta.totalTurns;
      }
      if (typeof pauseMeta.completedTurns === "number") {
        completedTurns = pauseMeta.completedTurns;
      }
      if (Array.isArray(pauseMeta.activeExpertIds)) {
        activeExpertIds = pauseMeta.activeExpertIds as string[];
      }
    }
  } else if (isCompleted) {
    phase = "completed";
  }

  // 若未从 pause metadata 获取到 activeExpertIds，则回退到 host 指定或 expert 消息收集
  if (activeExpertIds.length === 0) {
    if (lastDesignatedExpertIds && lastDesignatedExpertIds.length > 0) {
      activeExpertIds = lastDesignatedExpertIds;
    } else if (expertMsgIds.size > 0) {
      activeExpertIds = [...expertMsgIds];
    }
  }

  // 非 paused 态下推算 totalTurns（便于进度条展示）
  if (phase !== "paused" && totalTurns === 0 && activeExpertIds.length > 0) {
    totalTurns = MAX_EXPERT_ROUNDS * activeExpertIds.length;
  }

  // 构建 activeExperts 列表
  const activeExperts: ExpertState[] = activeExpertIds.map((id) => {
    const def = experts.find((e) => e.id === id);
    return {
      id,
      name: def?.name ?? id,
      avatarColor: def?.avatarColor ?? "emerald",
      spoken: spokenInCurrentRound.has(id),
      speaking: false,
    };
  });

  return {
    phase,
    currentRound,
    maxRounds: MAX_EXPERT_ROUNDS,
    totalTurns,
    completedTurns,
    activeExperts,
    divergences: knowledgeCounts.divergence,
    consensus: knowledgeCounts.consensus,
  };
}

/**
 * 从快照基线状态重放增量消息，重建讨论状态
 *
 * 与 rebuildStateFromMessages 类似，但从 baseState 起始而非从零开始，
 * 仅处理快照点之后的增量消息。避免了长讨论时扫描全部消息。
 *
 * @param baseState 快照时的基线状态
 * @param messages 快照点之后的增量消息（按 seq 升序）
 * @param experts 当前可用的专家定义
 * @param knowledgeCounts 知识库计数
 * @param isCompleted 项目是否已结束
 */
export function replayFromBaseState(
  baseState: DiscussionState,
  messages: RebuildMessage[],
  experts: ExpertDefinition[],
  knowledgeCounts: { consensus: number; divergence: number },
  isCompleted = false
): DiscussionState {
  // 以 baseState 为起点
  let phase: DiscussionPhase = baseState.phase;
  let currentRound = baseState.currentRound;
  let completedTurns = baseState.completedTurns;
  let totalTurns = baseState.totalTurns;

  const expertsByRound = new Map<number, Set<string>>();
  // 从 baseState 的 activeExperts 初始化当前轮已发言集合
  if (baseState.activeExperts.length > 0) {
    const spokenSet = new Set<string>();
    for (const e of baseState.activeExperts) {
      if (e.spoken) spokenSet.add(e.id);
    }
    expertsByRound.set(currentRound, spokenSet);
  }

  let activeExpertIds = baseState.activeExperts.map(e => e.id);

  for (const msg of messages) {
    if (msg.role.startsWith("expert:")) {
      const expertId = msg.role.slice(7);
      const meta = parseMetadata(msg.metadata);
      const round = meta && typeof meta.round === "number" ? meta.round : currentRound;
      if (!expertsByRound.has(round)) expertsByRound.set(round, new Set());
      expertsByRound.get(round)!.add(expertId);
      completedTurns++;
    } else if (msg.role === "host") {
      const meta = parseMetadata(msg.metadata);
      if (meta && Array.isArray(meta.designatedExpertIds)) {
        activeExpertIds = meta.designatedExpertIds as string[];
      }
    }
  }

  // 更新当前轮次
  if (expertsByRound.size > 0) {
    currentRound = Math.max(...expertsByRound.keys());
  }
  const spokenInCurrentRound = expertsByRound.get(currentRound) ?? new Set<string>();

  // 收集增量消息中的专家 ID
  const expertMsgIds = new Set<string>(activeExpertIds);
  for (const set of expertsByRound.values()) {
    for (const id of set) expertMsgIds.add(id);
  }

  // 检查最后一条消息是否为 pause
  const lastMsg = messages[messages.length - 1];
  if (lastMsg && lastMsg.role === "pause") {
    const pauseMeta = parseMetadata(lastMsg.metadata);
    if (pauseMeta) {
      phase = "paused";
      if (typeof pauseMeta.totalTurns === "number") totalTurns = pauseMeta.totalTurns;
      if (typeof pauseMeta.completedTurns === "number") completedTurns = pauseMeta.completedTurns;
      if (Array.isArray(pauseMeta.activeExpertIds)) activeExpertIds = pauseMeta.activeExpertIds as string[];
    }
  } else if (isCompleted) {
    phase = "completed";
  }

  // 非 paused 态下推算 totalTurns
  if (phase !== "paused" && totalTurns === 0 && activeExpertIds.length > 0) {
    totalTurns = MAX_EXPERT_ROUNDS * activeExpertIds.length;
  }

  // 构建 activeExperts 列表
  const activeExperts: ExpertState[] = activeExpertIds.map((id) => {
    const def = experts.find((e) => e.id === id);
    return {
      id,
      name: def?.name ?? id,
      avatarColor: def?.avatarColor ?? "emerald",
      spoken: spokenInCurrentRound.has(id),
      speaking: false,
    };
  });

  return {
    phase,
    currentRound,
    maxRounds: MAX_EXPERT_ROUNDS,
    totalTurns,
    completedTurns,
    activeExperts,
    divergences: knowledgeCounts.divergence,
    consensus: knowledgeCounts.consensus,
  };
}
