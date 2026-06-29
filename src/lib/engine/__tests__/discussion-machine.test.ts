/**
 * 讨论状态机单元测试
 *
 * 验证 P0-2 Bug 修复：
 * - Fix 1: isAllDone guard off-by-one（completedTurns + 1）
 * - Fix 2: shouldPauseNow guard off-by-one（completedTurns + 1）
 * - 正常完成、暂停时机、恢复、多次暂停等场景
 */

import { describe, it, expect } from "vitest";
import {
  createDiscussionActor,
  getCurrentExpertId,
  getCurrentRound,
  isLastExpert,
  type DiscussionMachineSnapshot,
} from "../discussion-machine";
import type { Actor } from "xstate";

// ===== 辅助函数 =====

/** 创建并启动状态机，发送 START + HOST_DONE，进入 discussing 状态 */
function startDiscussion(expertIds: string[]): Actor<typeof import("../discussion-machine").discussionMachine> {
  const actor = createDiscussionActor({ expertIds });
  actor.start();
  actor.send({ type: "START", expertIds });
  actor.send({ type: "HOST_DONE" });
  return actor;
}

/** 从 RESUME_FROM 恢复讨论 */
function resumeDiscussion(
  expertIds: string[],
  startRound: number,
  startIndex: number,
  completedTurns: number
): Actor<typeof import("../discussion-machine").discussionMachine> {
  const actor = createDiscussionActor({ expertIds });
  actor.start();
  actor.send({ type: "RESUME_FROM", expertIds, startRound, startIndex, completedTurns });
  return actor;
}

/** 发送 N 次 EXPERT_DONE，收集每次后的快照（不处理暂停） */
function sendExpertDoneN(
  actor: Actor<typeof import("../discussion-machine").discussionMachine>,
  n: number
): DiscussionMachineSnapshot[] {
  const snapshots: DiscussionMachineSnapshot[] = [];
  for (let i = 0; i < n; i++) {
    actor.send({ type: "EXPERT_DONE" });
    snapshots.push(actor.getSnapshot());
  }
  return snapshots;
}

/**
 * 模拟专家发言直到讨论完成，自动处理暂停（发送 RESUME）
 * 返回每次 EXPERT_DONE 后的快照列表和专家发言次数
 */
function runToCompletion(
  actor: Actor<typeof import("../discussion-machine").discussionMachine>,
  maxTurns: number = 100
): { snapshots: DiscussionMachineSnapshot[]; expertTurns: number } {
  const snapshots: DiscussionMachineSnapshot[] = [];
  let expertTurns = 0;
  while (expertTurns < maxTurns) {
    const snapshot = actor.getSnapshot();
    if (snapshot.value === "completed") break;
    if (snapshot.value === "paused") {
      actor.send({ type: "RESUME" });
      continue;
    }
    if (snapshot.value !== "discussing") break;
    actor.send({ type: "EXPERT_DONE" });
    expertTurns++;
    snapshots.push(actor.getSnapshot());
  }
  return { snapshots, expertTurns };
}

/**
 * 推进 N 位专家发言（自动处理暂停），返回推进后的快照
 */
function advanceNTurns(
  actor: Actor<typeof import("../discussion-machine").discussionMachine>,
  n: number
): DiscussionMachineSnapshot {
  let count = 0;
  while (count < n) {
    const snapshot = actor.getSnapshot();
    if (snapshot.value === "paused") {
      actor.send({ type: "RESUME" });
      continue;
    }
    if (snapshot.value !== "discussing") break;
    actor.send({ type: "EXPERT_DONE" });
    count++;
  }
  return actor.getSnapshot();
}

// ===== 测试用例 =====

describe("discussion-machine: 正常完成", () => {
  it("2专家×5轮=10轮，10位专家发言后 completed", () => {
    const actor = startDiscussion(["a", "b"]);
    const { snapshots, expertTurns } = runToCompletion(actor);

    expect(expertTurns).toBe(10);
    // 最后一次后应为 completed
    expect(snapshots[9].value).toBe("completed");
    // completedTurns 应为 10（advance 后的值）
    expect(snapshots[9].context.completedTurns).toBe(10);
  });

  it("1专家×5轮=5轮，5次 EXPERT_DONE 后 completed（不暂停）", () => {
    const actor = startDiscussion(["solo"]);
    const snapshots = sendExpertDoneN(actor, 5);

    expect(snapshots[4].value).toBe("completed");
    expect(snapshots[4].context.completedTurns).toBe(5);
    // 前 4 次应为 discussing，不应暂停
    for (let i = 0; i < 4; i++) {
      expect(snapshots[i].value).toBe("discussing");
    }
  });

  it("3专家×5轮=15轮，15位专家发言后 completed", () => {
    const actor = startDiscussion(["a", "b", "c"]);
    const { snapshots, expertTurns } = runToCompletion(actor);

    expect(expertTurns).toBe(15);
    expect(snapshots[14].value).toBe("completed");
    expect(snapshots[14].context.completedTurns).toBe(15);
  });
});

describe("discussion-machine: 暂停时机", () => {
  it("2专家×5轮，第 5 次 EXPERT_DONE 后 paused（不是第 6 次）", () => {
    const actor = startDiscussion(["a", "b"]);
    const snapshots = sendExpertDoneN(actor, 6);

    // 第 5 次后应为 paused
    expect(snapshots[4].value).toBe("paused");
    // 第 4 次后应仍为 discussing
    expect(snapshots[3].value).toBe("discussing");
  });

  it("暂停时 completedTurns 正确递增", () => {
    const actor = startDiscussion(["a", "b"]);
    const snapshots = sendExpertDoneN(actor, 5);

    expect(snapshots[4].value).toBe("paused");
    // 暂停时 advanceToNextExpert 已执行，completedTurns = 5
    expect(snapshots[4].context.completedTurns).toBe(5);
    expect(snapshots[4].context.pauseBase).toBe(0);
  });
});

describe("discussion-machine: 暂停后恢复", () => {
  it("暂停后 RESUME，pauseBase 更新，继续至完成", () => {
    const actor = startDiscussion(["a", "b"]);

    // 5 次后暂停
    sendExpertDoneN(actor, 5);
    expect(actor.getSnapshot().value).toBe("paused");
    expect(actor.getSnapshot().context.completedTurns).toBe(5);

    // 恢复
    actor.send({ type: "RESUME" });
    expect(actor.getSnapshot().value).toBe("discussing");
    // pauseBase 应更新为当前 completedTurns
    expect(actor.getSnapshot().context.pauseBase).toBe(5);

    // 继续发送 5 次 EXPERT_DONE → 完成
    const remaining = sendExpertDoneN(actor, 5);
    expect(remaining[4].value).toBe("completed");
    expect(remaining[4].context.completedTurns).toBe(10);
  });

  it("3专家×5轮=15轮，多次暂停→恢复→完成", () => {
    const actor = startDiscussion(["a", "b", "c"]);

    // 第 5 次暂停
    sendExpertDoneN(actor, 5);
    expect(actor.getSnapshot().value).toBe("paused");

    // 恢复
    actor.send({ type: "RESUME" });

    // 第 10 次暂停
    sendExpertDoneN(actor, 5);
    expect(actor.getSnapshot().value).toBe("paused");

    // 恢复
    actor.send({ type: "RESUME" });

    // 第 15 次完成
    sendExpertDoneN(actor, 5);
    expect(actor.getSnapshot().value).toBe("completed");
    expect(actor.getSnapshot().context.completedTurns).toBe(15);
  });
});

describe("discussion-machine: isAllDone 优先于 shouldPause", () => {
  it("totalTurns=5, PAUSE_AFTER=5 时，第 5 次完成而非暂停", () => {
    // 1专家×5轮=5轮，PAUSE_AFTER_EXPERT_TURNS=5
    // 第 5 次 EXPERT_DONE: isAllDone(4+1>=5)=true → completed（优先于 shouldPause）
    const actor = startDiscussion(["solo"]);
    const snapshots = sendExpertDoneN(actor, 5);

    expect(snapshots[4].value).toBe("completed");
    expect(snapshots[4].value).not.toBe("paused");
  });
});

describe("discussion-machine: isLastExpert", () => {
  it("2专家，round=4 index=1 时 isLastExpert=true", () => {
    const actor = startDiscussion(["a", "b"]);

    // 推进到 round=4, index=1（第 10 位专家），自动处理暂停
    advanceNTurns(actor, 9);

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("discussing");
    expect(snapshot.context.currentRound).toBe(4);
    expect(snapshot.context.currentIndex).toBe(1);
    expect(isLastExpert(snapshot)).toBe(true);
  });

  it("2专家，round=0 index=0 时 isLastExpert=false", () => {
    const actor = startDiscussion(["a", "b"]);
    const snapshot = actor.getSnapshot();

    expect(snapshot.context.currentRound).toBe(0);
    expect(snapshot.context.currentIndex).toBe(0);
    expect(isLastExpert(snapshot)).toBe(false);
  });

  it("1专家，round=4 index=0 时 isLastExpert=true", () => {
    const actor = startDiscussion(["solo"]);
    // 发送 4 次 EXPERT_DONE 到达最后一轮
    sendExpertDoneN(actor, 4);

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.currentRound).toBe(4);
    expect(snapshot.context.currentIndex).toBe(0);
    expect(isLastExpert(snapshot)).toBe(true);
  });
});

describe("discussion-machine: RESUME_FROM 恢复", () => {
  it("从中间状态恢复，验证 completedTurns 和 pauseBase", () => {
    const actor = resumeDiscussion(["a", "b"], 2, 1, 5);

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("discussing");
    expect(snapshot.context.currentRound).toBe(2);
    expect(snapshot.context.currentIndex).toBe(1);
    expect(snapshot.context.completedTurns).toBe(5);
    expect(snapshot.context.pauseBase).toBe(5);
    expect(snapshot.context.totalTurns).toBe(10);
  });

  it("从 RESUME_FROM 继续，5 次后完成", () => {
    // 从 completedTurns=5 恢复，还需 5 次
    const actor = resumeDiscussion(["a", "b"], 2, 1, 5);

    const snapshots = sendExpertDoneN(actor, 5);
    expect(snapshots[4].value).toBe("completed");
    expect(snapshots[4].context.completedTurns).toBe(10);
  });
});

describe("discussion-machine: ABORT 中止", () => {
  it("discussing 状态发送 ABORT → completed", () => {
    const actor = startDiscussion(["a", "b"]);
    expect(actor.getSnapshot().value).toBe("discussing");

    actor.send({ type: "ABORT" });
    expect(actor.getSnapshot().value).toBe("completed");
  });

  it("paused 状态发送 ABORT → completed", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 5);
    expect(actor.getSnapshot().value).toBe("paused");

    actor.send({ type: "ABORT" });
    expect(actor.getSnapshot().value).toBe("completed");
  });
});

describe("discussion-machine: getCurrentExpertId", () => {
  it("discussing 状态返回当前专家 ID", () => {
    const actor = startDiscussion(["a", "b"]);
    expect(getCurrentExpertId(actor.getSnapshot())).toBe("a");
  });

  it("completed 状态返回 null", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 10);
    expect(getCurrentExpertId(actor.getSnapshot())).toBeNull();
  });

  it("paused 状态返回 null", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 5);
    expect(getCurrentExpertId(actor.getSnapshot())).toBeNull();
  });
});

describe("discussion-machine: 轮次推进", () => {
  it("2专家，每 2 次 EXPERT_DONE 轮次 +1", () => {
    const actor = startDiscussion(["a", "b"]);

    expect(getCurrentRound(actor.getSnapshot())).toBe(0);

    actor.send({ type: "EXPERT_DONE" });
    expect(getCurrentRound(actor.getSnapshot())).toBe(0);

    actor.send({ type: "EXPERT_DONE" });
    expect(getCurrentRound(actor.getSnapshot())).toBe(1);

    actor.send({ type: "EXPERT_DONE" });
    expect(getCurrentRound(actor.getSnapshot())).toBe(1);

    actor.send({ type: "EXPERT_DONE" });
    expect(getCurrentRound(actor.getSnapshot())).toBe(2);
  });
});

// ===== P2-1: 动态总结测试 =====

// ===== DEF-06: 软停止状态测试 =====

describe("discussion-machine: DEF-06 软停止", () => {
  it("DEF-06-01: hosting 状态发送 SOFT_STOP → completed", () => {
    // 创建 actor 并发送 START（但不发送 HOST_DONE），保持在 hosting 状态
    const actor = createDiscussionActor({ expertIds: ["a", "b"] });
    actor.start();
    actor.send({ type: "START", expertIds: ["a", "b"] });
    expect(actor.getSnapshot().value).toBe("hosting");

    // 在 hosting 状态发送 SOFT_STOP → 应转为 completed
    actor.send({ type: "SOFT_STOP" });
    expect(actor.getSnapshot().value).toBe("completed");
  });

  it("DEF-06-02: discussing 状态发送 SOFT_STOP → softStopping", () => {
    const actor = startDiscussion(["a", "b"]);
    expect(actor.getSnapshot().value).toBe("discussing");

    actor.send({ type: "SOFT_STOP" });
    expect(actor.getSnapshot().value).toBe("softStopping");
  });

  it("DEF-06-03: softStopping 状态发送 EXPERT_DONE → completed", () => {
    const actor = startDiscussion(["a", "b"]);
    actor.send({ type: "SOFT_STOP" });
    expect(actor.getSnapshot().value).toBe("softStopping");

    actor.send({ type: "EXPERT_DONE" });
    expect(actor.getSnapshot().value).toBe("completed");
  });
});

describe("discussion-machine: P2-1 动态总结", () => {
  it("TU-P2-1-01: 动态总结触发 — 共识 +2", () => {
    const actor = startDiscussion(["a", "b"]);
    // 发送几次 EXPERT_DONE 进入讨论
    sendExpertDoneN(actor, 2);

    // 模拟知识提取后共识 +2（从 0 到 2）
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 2, divergenceCount: 0 });
    expect(actor.getSnapshot().value).toBe("summarizing");
  });

  it("TU-P2-1-02: 动态总结触发 — 分歧 +2", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 2);

    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 0, divergenceCount: 2 });
    expect(actor.getSnapshot().value).toBe("summarizing");
  });

  it("TU-P2-1-03: 动态总结不触发 — 变化 < 2", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 2);

    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 1, divergenceCount: 1 });
    expect(actor.getSnapshot().value).toBe("discussing");
  });

  it("TU-P2-1-04: 总结完成后返回讨论", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 2);
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 2, divergenceCount: 0 });
    expect(actor.getSnapshot().value).toBe("summarizing");

    actor.send({ type: "SUMMARY_DONE" });
    expect(actor.getSnapshot().value).toBe("discussing");
  });

  it("TU-P2-1-05: 总结中可 ABORT", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 2);
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 2, divergenceCount: 0 });
    expect(actor.getSnapshot().value).toBe("summarizing");

    actor.send({ type: "ABORT" });
    expect(actor.getSnapshot().value).toBe("completed");
  });

  it("TU-P2-1-06: lastSummaryConsensus 更新", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 2);
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 3, divergenceCount: 1 });

    const ctx = actor.getSnapshot().context;
    expect(ctx.lastSummaryConsensus).toBe(3);
    expect(ctx.lastSummaryDivergence).toBe(1);
    expect(ctx.consensusCount).toBe(3);
    expect(ctx.divergenceCount).toBe(1);
  });

  it("TU-P2-1-07: 二次触发需新变化", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 2);

    // 第一次触发：共识 0→2
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 2, divergenceCount: 0 });
    expect(actor.getSnapshot().value).toBe("summarizing");

    // 总结完成
    actor.send({ type: "SUMMARY_DONE" });
    expect(actor.getSnapshot().value).toBe("discussing");

    // 第二次：共识仍是 2，delta=0，不触发
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 2, divergenceCount: 0 });
    expect(actor.getSnapshot().value).toBe("discussing");

    // 第三次：共识 2→4，delta=2，触发
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 4, divergenceCount: 0 });
    expect(actor.getSnapshot().value).toBe("summarizing");
  });

  it("TU-P2-1-08: shouldDynamicSummarize guard 边界", () => {
    const actor = startDiscussion(["a", "b"]);
    sendExpertDoneN(actor, 2);

    // consensusDelta=2, divergenceDelta=0 → 触发
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 2, divergenceCount: 0 });
    expect(actor.getSnapshot().value).toBe("summarizing");
    actor.send({ type: "SUMMARY_DONE" });

    // consensusDelta=0, divergenceDelta=2 → 触发
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 2, divergenceCount: 2 });
    expect(actor.getSnapshot().value).toBe("summarizing");
    actor.send({ type: "SUMMARY_DONE" });

    // consensusDelta=0, divergenceDelta=1 → 不触发
    actor.send({ type: "TRIGGER_SUMMARY", consensusCount: 2, divergenceCount: 3 });
    expect(actor.getSnapshot().value).toBe("discussing");
  });
});
