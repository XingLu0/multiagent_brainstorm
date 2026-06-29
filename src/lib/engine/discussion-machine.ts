/**
 * 讨论状态机（XState v5）
 *
 * Bridge 模式：状态机仅负责调度决策（哪位专家下一个发言、何时暂停、何时停止），
 * SSE 流式输出由引擎宿主直接处理。
 *
 * 状态机不持有 streamText / expertAgent / hostAgent 引用，
 * 通过事件接收「流开始/结束」信号，引擎宿主读取 snapshot 决定下一步操作。
 *
 * 7 状态：idle → hosting → discussing → (paused ↔ discussing) → softStopping → summarizing → completed
 */

import { setup, assign, createActor, type Actor, type SnapshotFrom } from "xstate";
import { MAX_EXPERT_ROUNDS } from "./constants";
import { shouldPause, type ScheduleEntry, createSchedule, getRemainingSchedule } from "./expert-scheduler";

// ===== 类型定义 =====

/**
 * 状态机上下文
 */
export interface DiscussionMachineContext {
  /** 当前轮次 (0-indexed) */
  currentRound: number;
  /** 当前专家索引 (在 activeExpertIds 中的位置) */
  currentIndex: number;
  /** 已完成的专家发言轮次总数 */
  completedTurns: number;
  /** 总轮次数 = MAX_EXPERT_ROUNDS × activeExpertIds.length */
  totalTurns: number;
  /** 暂停基线（从上次暂停点恢复后的 completedTurns 值） */
  pauseBase: number;
  /** 参与讨论的专家 ID 列表 */
  activeExpertIds: string[];
  /** 完整调度列表 */
  schedule: ScheduleEntry[];
  /** P2-1: 当前共识知识条目数 */
  consensusCount: number;
  /** P2-1: 当前分歧知识条目数 */
  divergenceCount: number;
  /** P2-1: 上次动态总结时的共识数 */
  lastSummaryConsensus: number;
  /** P2-1: 上次动态总结时的分歧数 */
  lastSummaryDivergence: number;
}

/**
 * 状态机事件
 */
export type DiscussionMachineEvent =
  | { type: "START"; expertIds: string[] }
  | { type: "HOST_DONE" }
  | { type: "EXPERT_DONE" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "SOFT_STOP" }
  | { type: "COMPLETE" }
  | { type: "ABORT" }
  | {
      type: "RESUME_FROM";
      expertIds: string[];
      startRound: number;
      startIndex: number;
      completedTurns: number;
    }
  // P2-1: 动态总结触发事件（引擎在知识提取后发送）
  | { type: "TRIGGER_SUMMARY"; consensusCount: number; divergenceCount: number }
  // P2-1: 动态总结完成事件（引擎调用 generateSummary 后发送）
  | { type: "SUMMARY_DONE" };

/**
 * 状态机输入
 */
export interface DiscussionMachineInput {
  expertIds: string[];
}

// ===== 状态机定义 =====

const discussionMachine = setup({
  types: {
    context: {} as DiscussionMachineContext,
    events: {} as DiscussionMachineEvent,
    input: {} as DiscussionMachineInput,
  },
  guards: {
    // Guard 在 advanceToNextExpert action 之前求值，
    // 因此需要用 completedTurns + 1 表示 action 执行后的值
    shouldPauseNow: ({ context }) =>
      shouldPause(
        context.completedTurns + 1,
        context.pauseBase,
        context.totalTurns
      ),
    isAllDone: ({ context }) =>
      context.completedTurns + 1 >= context.totalTurns,
    hasMoreExperts: ({ context }) =>
      context.currentIndex < context.activeExpertIds.length - 1,
    // P2-1: 动态总结触发条件 — 共识或分歧有显著变化（新增 >= 2 条）
    shouldDynamicSummarize: ({ context, event }) => {
      if (event.type !== "TRIGGER_SUMMARY") return false;
      const consensusDelta = event.consensusCount - context.lastSummaryConsensus;
      const divergenceDelta = event.divergenceCount - context.lastSummaryDivergence;
      return consensusDelta >= 2 || divergenceDelta >= 2;
    },
  },
  actions: {
    initializeContext: assign({
      activeExpertIds: ({ event }) =>
        event.type === "START" ? event.expertIds : [],
      totalTurns: ({ event }) =>
        event.type === "START"
          ? event.expertIds.length * MAX_EXPERT_ROUNDS
          : 0,
      schedule: ({ event }) =>
        event.type === "START" ? createSchedule(event.expertIds) : [],
      currentRound: 0,
      currentIndex: 0,
      completedTurns: 0,
      pauseBase: 0,
      consensusCount: 0,
      divergenceCount: 0,
      lastSummaryConsensus: 0,
      lastSummaryDivergence: 0,
    }),
    advanceToNextExpert: assign(({ context }) => {
      const newCompleted = context.completedTurns + 1;
      if (context.currentIndex < context.activeExpertIds.length - 1) {
        // 同一轮内下一位专家
        return {
          ...context,
          currentIndex: context.currentIndex + 1,
          completedTurns: newCompleted,
        };
      }
      // 跨轮：进入下一轮第一位专家
      return {
        ...context,
        currentRound: context.currentRound + 1,
        currentIndex: 0,
        completedTurns: newCompleted,
      };
    }),
    resetPauseBase: assign({
      pauseBase: ({ context }) => context.completedTurns,
    }),
    resumeContext: assign(({ event }) => {
      if (event.type !== "RESUME_FROM") return {};
      const expertIds = event.expertIds;
      return {
        activeExpertIds: expertIds,
        totalTurns: expertIds.length * MAX_EXPERT_ROUNDS,
        schedule: createSchedule(expertIds),
        currentRound: event.startRound,
        currentIndex: event.startIndex,
        completedTurns: event.completedTurns,
        pauseBase: event.completedTurns,
      };
    }),
    // P2-1: 更新知识计数字段
    updateKnowledgeCounts: assign(({ context, event }) => {
      if (event.type !== "TRIGGER_SUMMARY") return {};
      return {
        consensusCount: event.consensusCount,
        divergenceCount: event.divergenceCount,
        lastSummaryConsensus: event.consensusCount,
        lastSummaryDivergence: event.divergenceCount,
      };
    }),
  },
}).createMachine({
  id: "discussion",
  initial: "idle",
  context: {
    currentRound: 0,
    currentIndex: 0,
    completedTurns: 0,
    totalTurns: 0,
    pauseBase: 0,
    activeExpertIds: [],
    schedule: [],
    consensusCount: 0,
    divergenceCount: 0,
    lastSummaryConsensus: 0,
    lastSummaryDivergence: 0,
  },
  states: {
    idle: {
      on: {
        START: {
          target: "hosting",
          actions: "initializeContext",
        },
        RESUME_FROM: {
          target: "discussing",
          actions: "resumeContext",
        },
      },
    },
    hosting: {
      on: {
        HOST_DONE: "discussing",
        ABORT: "completed",
        SOFT_STOP: "completed",
      },
    },
    discussing: {
      on: {
        EXPERT_DONE: [
          {
            guard: "isAllDone",
            target: "completed",
            actions: "advanceToNextExpert",
          },
          {
            guard: "shouldPauseNow",
            target: "paused",
            actions: "advanceToNextExpert",
          },
          {
            target: "discussing",
            actions: "advanceToNextExpert",
          },
        ],
        SOFT_STOP: "softStopping",
        ABORT: "completed",
        // P2-1: 动态总结触发 — 知识计数变化满足条件时进入总结状态
        TRIGGER_SUMMARY: {
          guard: "shouldDynamicSummarize",
          target: "summarizing",
          actions: "updateKnowledgeCounts",
        },
      },
    },
    paused: {
      on: {
        RESUME: {
          target: "discussing",
          actions: "resetPauseBase",
        },
        ABORT: "completed",
      },
    },
    // softStopping: 专家完成当前发言后结束讨论
    softStopping: {
      on: {
        EXPERT_DONE: "completed",
        ABORT: "completed",
      },
    },
    // P2-1: 动态总结状态 — 引擎调用 generateSummary 后发送 SUMMARY_DONE 返回讨论
    summarizing: {
      on: {
        SUMMARY_DONE: "discussing",
        SOFT_STOP: "softStopping",
        ABORT: "completed",
      },
    },
    completed: {
      type: "final",
    },
  },
});

// ===== 工厂函数与辅助类型 =====

/**
 * 创建讨论状态机 Actor
 */
export function createDiscussionActor(input: DiscussionMachineInput): Actor<typeof discussionMachine> {
  return createActor(discussionMachine, { input });
}

/**
 * 状态机快照类型
 */
export type DiscussionMachineSnapshot = SnapshotFrom<typeof discussionMachine>;

/**
 * 获取当前应发言的专家 ID
 * 引擎宿主在 discussing 状态下读取此值决定调用哪个专家
 */
export function getCurrentExpertId(
  snapshot: DiscussionMachineSnapshot
): string | null {
  if (snapshot.value !== "discussing" && snapshot.value !== "softStopping") {
    return null;
  }
  const { activeExpertIds, currentIndex } = snapshot.context;
  return activeExpertIds[currentIndex] ?? null;
}

/**
 * 获取当前轮次号
 */
export function getCurrentRound(
  snapshot: DiscussionMachineSnapshot
): number {
  return snapshot.context.currentRound;
}

/**
 * 判断是否是最后一位专家（用于决定是否需要 [HOOK]）
 */
export function isLastExpert(
  snapshot: DiscussionMachineSnapshot
): boolean {
  const { currentRound, currentIndex, activeExpertIds, totalTurns } = snapshot.context;
  const currentTurn = currentRound * activeExpertIds.length + currentIndex + 1;
  return currentTurn >= totalTurns;
}

/**
 * 获取剩余调度条目（用于恢复场景）
 */
export function getRemainingEntries(
  snapshot: DiscussionMachineSnapshot
): ScheduleEntry[] {
  return getRemainingSchedule(
    snapshot.context.schedule,
    snapshot.context.currentRound,
    snapshot.context.currentIndex
  );
}

export { discussionMachine };
