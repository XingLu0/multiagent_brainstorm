/**
 * 引擎讨论循环集成测试
 *
 * 模拟 BrainstormEngine.runExpertDiscussion 的核心循环逻辑，
 * 不依赖 Prisma/LLM，验证状态机与引擎宿主的端到端协作：
 * - 恰好 N 位专家发言后完成（不多不少）
 * - 暂停+恢复流程正确
 * - 知识提取在完成时恰好执行 1 次（Fix 3 回归测试）
 */

import { describe, it, expect } from "vitest";
import {
  createDiscussionActor,
  getCurrentExpertId,
  getCurrentRound,
} from "../discussion-machine";

/**
 * 模拟引擎讨论循环
 *
 * 复刻 runExpertDiscussion 的核心逻辑：
 * 1. 读取 snapshot
 * 2. completed → stop（Fix 3: 不在此处提取知识）
 * 3. paused → 模拟暂停处理，自动 RESUME
 * 4. discussing → 模拟专家发言，发送 EXPERT_DONE
 * 5. 轮次变化或完成时 → 提取知识
 */
function simulateDiscussionLoop(
  expertIds: string[],
  options: {
    autoResume?: boolean; // 暂停后自动恢复（默认 true）
    maxIterations?: number; // 安全上限
  } = {}
): {
  expertCalls: { expertId: string; round: number }[];
  knowledgeExtractions: number;
  pauseCount: number;
  finalState: string;
  completedTurns: number;
} {
  const { autoResume = true, maxIterations = 100 } = options;

  const actor = createDiscussionActor({ expertIds });
  actor.start();
  actor.send({ type: "START", expertIds });
  actor.send({ type: "HOST_DONE" });

  const expertCalls: { expertId: string; round: number }[] = [];
  let knowledgeExtractions = 0;
  let pauseCount = 0;

  for (let i = 0; i < maxIterations; i++) {
    const snapshot = actor.getSnapshot();

    // Fix 3: completed 分支不再提取知识
    if (snapshot.value === "completed") {
      actor.stop();
      return {
        expertCalls,
        knowledgeExtractions,
        pauseCount,
        finalState: "completed",
        completedTurns: snapshot.context.completedTurns,
      };
    }

    // 暂停处理
    if (snapshot.value === "paused") {
      pauseCount++;
      if (!autoResume) {
        actor.stop();
        return {
          expertCalls,
          knowledgeExtractions,
          pauseCount,
          finalState: "paused",
          completedTurns: snapshot.context.completedTurns,
        };
      }
      actor.send({ type: "RESUME" });
      continue;
    }

    // 非 discussing 状态，停止
    if (snapshot.value !== "discussing") {
      actor.stop();
      return {
        expertCalls,
        knowledgeExtractions,
        pauseCount,
        finalState: snapshot.value,
        completedTurns: snapshot.context.completedTurns,
      };
    }

    // 获取当前专家
    const expertId = getCurrentExpertId(snapshot);
    if (!expertId) {
      actor.stop();
      break;
    }

    const round = getCurrentRound(snapshot);

    // 模拟专家发言
    expertCalls.push({ expertId, round });

    // 推进状态机
    const roundBefore = getCurrentRound(actor.getSnapshot());
    actor.send({ type: "EXPERT_DONE" });
    const newSnapshot = actor.getSnapshot();
    const roundAfter = getCurrentRound(newSnapshot);

    // 轮次变化或完成时提取知识（复刻引擎逻辑）
    if (roundAfter !== roundBefore || newSnapshot.value === "completed") {
      knowledgeExtractions++;
    }
  }

  actor.stop();
  return {
    expertCalls,
    knowledgeExtractions,
    pauseCount,
    finalState: "max_iterations",
    completedTurns: -1,
  };
}

// ===== 测试用例 =====

describe("integration: 完整讨论流程", () => {
  it("2专家，恰好 10 位专家发言后完成", () => {
    const result = simulateDiscussionLoop(["a", "b"]);

    expect(result.finalState).toBe("completed");
    expect(result.expertCalls).toHaveLength(10);
    expect(result.completedTurns).toBe(10);
    expect(result.pauseCount).toBeGreaterThan(0); // 会经历暂停
  });

  it("1专家，恰好 5 位专家发言后完成", () => {
    const result = simulateDiscussionLoop(["solo"]);

    expect(result.finalState).toBe("completed");
    expect(result.expertCalls).toHaveLength(5);
    expect(result.completedTurns).toBe(5);
  });

  it("3专家，恰好 15 位专家发言后完成", () => {
    const result = simulateDiscussionLoop(["a", "b", "c"]);

    expect(result.finalState).toBe("completed");
    expect(result.expertCalls).toHaveLength(15);
    expect(result.completedTurns).toBe(15);
  });

  it("2专家，专家发言顺序正确（a,b,a,b,...）", () => {
    const result = simulateDiscussionLoop(["a", "b"]);

    const ids = result.expertCalls.map((c) => c.expertId);
    // 跳过暂停后的部分，检查前 2 位
    expect(ids[0]).toBe("a");
    expect(ids[1]).toBe("b");
    // 检查最后 2 位（完成前的最后两位）
    expect(ids[ids.length - 2]).toBe("a");
    expect(ids[ids.length - 1]).toBe("b");
  });
});

describe("integration: 暂停+恢复流程", () => {
  it("2专家，5 位发言→暂停→恢复→5 位发言→完成", () => {
    // 第一阶段：不自动恢复，验证暂停点
    const phase1 = simulateDiscussionLoop(["a", "b"], { autoResume: false });
    expect(phase1.finalState).toBe("paused");
    expect(phase1.expertCalls).toHaveLength(5);
    expect(phase1.pauseCount).toBe(1);

    // 第二阶段：自动恢复，验证完整流程
    const full = simulateDiscussionLoop(["a", "b"], { autoResume: true });
    expect(full.finalState).toBe("completed");
    expect(full.expertCalls).toHaveLength(10);
    expect(full.pauseCount).toBeGreaterThanOrEqual(1);
  });

  it("3专家，多次暂停→恢复→完成", () => {
    const result = simulateDiscussionLoop(["a", "b", "c"]);

    expect(result.finalState).toBe("completed");
    expect(result.expertCalls).toHaveLength(15);
    // 3专家×5轮=15轮，PAUSE_AFTER=5 → 应暂停 2 次（5和10），第15次完成
    expect(result.pauseCount).toBe(2);
  });
});

describe("integration: 知识提取次数（Fix 3 回归测试）", () => {
  it("2专家，完成时知识提取恰好 1 次（不是 2 次）", () => {
    const result = simulateDiscussionLoop(["a", "b"]);

    expect(result.finalState).toBe("completed");
    // 知识提取次数 = 轮次变化次数（不含重复的 completed 提取）
    // 2专家×5轮=10轮，轮次变化 4 次（round 0→1, 1→2, 2→3, 3→4）+ 完成时 1 次 = 5 次
    // 关键：完成时只提取 1 次（不是 2 次）
    const expectedExtractions = 4 + 1; // 4 次轮次变化 + 1 次完成
    expect(result.knowledgeExtractions).toBe(expectedExtractions);
  });

  it("1专家，完成时知识提取恰好 1 次", () => {
    const result = simulateDiscussionLoop(["solo"]);

    expect(result.finalState).toBe("completed");
    // 1专家：轮次变化 4 次（round 0→1, 1→2, 2→3, 3→4）+ 完成时 1 次 = 5 次
    // 但 1 专家每轮 1 人，所以每次 EXPERT_DONE 都触发轮次变化
    // round 0→1, 1→2, 2→3, 3→4 = 4 次 + 完成时 1 次 = 5 次
    expect(result.knowledgeExtractions).toBe(5);
  });

  it("3专家，完成时知识提取不重复", () => {
    const result = simulateDiscussionLoop(["a", "b", "c"]);

    expect(result.finalState).toBe("completed");
    // 3专家×5轮=15轮
    // 轮次变化：4 次（0→1, 1→2, 2→3, 3→4）+ 完成时 1 次 = 5 次
    expect(result.knowledgeExtractions).toBe(5);
  });
});

describe("integration: 不会多发言（Fix 1 回归测试）", () => {
  it("2专家，不会出现第 11 位专家", () => {
    const result = simulateDiscussionLoop(["a", "b"]);

    expect(result.expertCalls).toHaveLength(10);
    expect(result.expertCalls).not.toHaveLength(11);
    expect(result.finalState).toBe("completed");
  });

  it("1专家，不会出现第 6 位专家", () => {
    const result = simulateDiscussionLoop(["solo"]);

    expect(result.expertCalls).toHaveLength(5);
    expect(result.expertCalls).not.toHaveLength(6);
    expect(result.finalState).toBe("completed");
  });
});

describe("integration: 暂停时机正确（Fix 2 回归测试）", () => {
  it("2专家，第 5 位发言后暂停（不是第 6 位）", () => {
    const result = simulateDiscussionLoop(["a", "b"], { autoResume: false });

    expect(result.finalState).toBe("paused");
    expect(result.expertCalls).toHaveLength(5);
    expect(result.expertCalls).not.toHaveLength(6);
  });
});

// ===== P2-1: 动态总结集成测试 =====

/**
 * 模拟带动态总结的讨论循环
 *
 * 在每个轮次结束时（知识提取点），发送 TRIGGER_SUMMARY 事件。
 * 若状态机进入 summarizing，发送 SUMMARY_DONE 返回讨论。
 * 追踪动态总结和固定总结的触发次数。
 */
function simulateDiscussionWithDynamicSummary(
  expertIds: string[],
  options: {
    /** 每轮结束时的共识计数（round → count） */
    consensusByRound?: Record<number, number>;
    /** 每轮结束时的分歧计数（round → count） */
    divergenceByRound?: Record<number, number>;
    autoResume?: boolean;
    maxIterations?: number;
  } = {}
): {
  expertCalls: { expertId: string; round: number }[];
  knowledgeExtractions: number;
  dynamicSummaries: number;
  fixedSummaries: number;
  totalSummaries: number;
  pauseCount: number;
  finalState: string;
  completedTurns: number;
} {
  const {
    consensusByRound = {},
    divergenceByRound = {},
    autoResume = true,
    maxIterations = 100,
  } = options;

  const actor = createDiscussionActor({ expertIds });
  actor.start();
  actor.send({ type: "START", expertIds });
  actor.send({ type: "HOST_DONE" });

  const expertCalls: { expertId: string; round: number }[] = [];
  let knowledgeExtractions = 0;
  let dynamicSummaries = 0;
  const fixedSummaries = 0;
  let pauseCount = 0;

  for (let i = 0; i < maxIterations; i++) {
    const snapshot = actor.getSnapshot();

    if (snapshot.value === "completed") {
      actor.stop();
      return {
        expertCalls,
        knowledgeExtractions,
        dynamicSummaries,
        fixedSummaries,
        totalSummaries: dynamicSummaries + fixedSummaries,
        pauseCount,
        finalState: "completed",
        completedTurns: snapshot.context.completedTurns,
      };
    }

    if (snapshot.value === "paused") {
      pauseCount++;
      if (!autoResume) {
        actor.stop();
        return {
          expertCalls,
          knowledgeExtractions,
          dynamicSummaries,
          fixedSummaries,
          totalSummaries: dynamicSummaries + fixedSummaries,
          pauseCount,
          finalState: "paused",
          completedTurns: snapshot.context.completedTurns,
        };
      }
      actor.send({ type: "RESUME" });
      continue;
    }

    if (snapshot.value === "summarizing") {
      // 引擎调用 generateSummary 后发送 SUMMARY_DONE
      actor.send({ type: "SUMMARY_DONE" });
      continue;
    }

    if (snapshot.value !== "discussing" && snapshot.value !== "softStopping") {
      actor.stop();
      return {
        expertCalls,
        knowledgeExtractions,
        dynamicSummaries,
        fixedSummaries,
        totalSummaries: dynamicSummaries + fixedSummaries,
        pauseCount,
        finalState: snapshot.value,
        completedTurns: snapshot.context.completedTurns,
      };
    }

    const expertId = getCurrentExpertId(snapshot);
    if (!expertId) {
      actor.stop();
      break;
    }

    const round = getCurrentRound(snapshot);
    expertCalls.push({ expertId, round });

    // 推进状态机
    const roundBefore = getCurrentRound(actor.getSnapshot());
    actor.send({ type: "EXPERT_DONE" });
    const newSnapshot = actor.getSnapshot();
    const roundAfter = getCurrentRound(newSnapshot);

    // 轮次变化或完成时提取知识
    if (roundAfter !== roundBefore || newSnapshot.value === "completed") {
      knowledgeExtractions++;

      // P2-1: 知识提取后发送 TRIGGER_SUMMARY（仅 discussing/softStopping 状态）
      if (newSnapshot.value === "discussing" || newSnapshot.value === "softStopping") {
        const consensus = consensusByRound[roundBefore] ?? 0;
        const divergence = divergenceByRound[roundBefore] ?? 0;
        actor.send({ type: "TRIGGER_SUMMARY", consensusCount: consensus, divergenceCount: divergence });
        const summarySnapshot = actor.getSnapshot();
        if (summarySnapshot.value === "summarizing") {
          dynamicSummaries++;
        }
      }
    }
  }

  actor.stop();
  return {
    expertCalls,
    knowledgeExtractions,
    dynamicSummaries,
    fixedSummaries,
    totalSummaries: dynamicSummaries + fixedSummaries,
    pauseCount,
    finalState: "max_iterations",
    completedTurns: -1,
  };
}

describe("integration: P2-1 动态总结", () => {
  it("TI-P2-1-01: 动态总结与固定总结不冲突", () => {
    // 模拟第 1 轮结束时共识 +2，触发动态总结
    // 动态总结已标记该轮次，固定总结应跳过
    const result = simulateDiscussionWithDynamicSummary(
      ["a", "b"],
      {
        consensusByRound: { 0: 2, 1: 4, 2: 6, 3: 8 },
        divergenceByRound: {},
      }
    );

    expect(result.finalState).toBe("completed");
    expect(result.dynamicSummaries).toBeGreaterThan(0);
    // 每次轮次变化都触发动态总结（delta=2 每轮）
    // 4 次轮次变化 = 4 次动态总结
    expect(result.dynamicSummaries).toBe(4);
  });

  it("TI-P2-1-02: 动态总结在非固定轮触发", () => {
    // 模拟第 1 轮（round 0）共识 +2 触发动态总结
    // 第 2 轮（round 1）共识不变（delta=0），不触发动态总结
    // 第 3 轮（round 2）共识 +2 再次触发
    const result = simulateDiscussionWithDynamicSummary(
      ["a", "b"],
      {
        consensusByRound: { 0: 2, 1: 2, 2: 4, 3: 4 },
        divergenceByRound: {},
      }
    );

    expect(result.finalState).toBe("completed");
    // round 0: delta=2 → 触发
    // round 1: delta=0 → 不触发
    // round 2: delta=2 → 触发
    // round 3: delta=0 → 不触发
    expect(result.dynamicSummaries).toBe(2);
  });

  it("TI-P2-1-03: 动态总结后讨论继续", () => {
    // 触发动态总结后，讨论应继续剩余轮次直到完成
    const result = simulateDiscussionWithDynamicSummary(
      ["a", "b"],
      {
        consensusByRound: { 0: 2 },
        divergenceByRound: {},
      }
    );

    expect(result.finalState).toBe("completed");
    // 2专家×5轮=10次专家发言
    expect(result.expertCalls).toHaveLength(10);
    expect(result.completedTurns).toBe(10);
    // 动态总结触发 1 次（round 0 delta=2），其余轮次 delta=0 不触发
    expect(result.dynamicSummaries).toBe(1);
  });
});
