/**
 * 专家调度器单元测试
 *
 * 验证 shouldPause、createSchedule、getRemainingSchedule 等纯函数
 */

import { describe, it, expect } from "vitest";
import {
  shouldPause,
  createSchedule,
  getRemainingSchedule,
  isLastEntry,
} from "../expert-scheduler";

// ===== shouldPause 测试 =====

describe("shouldPause: 边界条件", () => {
  it("completedTurns=5, pauseBase=0, total=10 → true（刚达到阈值）", () => {
    expect(shouldPause(5, 0, 10)).toBe(true);
  });

  it("completedTurns=4, pauseBase=0, total=10 → false（未达阈值）", () => {
    expect(shouldPause(4, 0, 10)).toBe(false);
  });

  it("completedTurns=0, pauseBase=0, total=10 → false", () => {
    expect(shouldPause(0, 0, 10)).toBe(false);
  });

  it("completedTurns=6, pauseBase=0, total=10 → true（超过阈值）", () => {
    expect(shouldPause(6, 0, 10)).toBe(true);
  });
});

describe("shouldPause: 上界（不超 totalTurns）", () => {
  it("completedTurns=10, pauseBase=0, total=10 → false（等于 totalTurns）", () => {
    expect(shouldPause(10, 0, 10)).toBe(false);
  });

  it("completedTurns=9, pauseBase=0, total=10 → true（最后一个可暂停点）", () => {
    expect(shouldPause(9, 0, 10)).toBe(true);
  });

  it("completedTurns=15, pauseBase=0, total=15 → false", () => {
    expect(shouldPause(15, 0, 15)).toBe(false);
  });
});

describe("shouldPause: 恢复后重新计数", () => {
  it("completedTurns=10, pauseBase=5, total=15 → true（10-5>=5）", () => {
    expect(shouldPause(10, 5, 15)).toBe(true);
  });

  it("completedTurns=9, pauseBase=5, total=15 → false（9-5=4<5）", () => {
    expect(shouldPause(9, 5, 15)).toBe(false);
  });

  it("completedTurns=5, pauseBase=5, total=15 → false（刚恢复，5-5=0<5）", () => {
    expect(shouldPause(5, 5, 15)).toBe(false);
  });

  it("completedTurns=15, pauseBase=10, total=15 → false（等于 totalTurns）", () => {
    expect(shouldPause(15, 10, 15)).toBe(false);
  });
});

// ===== createSchedule 测试 =====

describe("createSchedule: 调度列表生成", () => {
  it("2专家 → 10 条目（2×5轮）", () => {
    const schedule = createSchedule(["a", "b"]);
    expect(schedule).toHaveLength(10);
  });

  it("3专家 → 15 条目（3×5轮）", () => {
    const schedule = createSchedule(["a", "b", "c"]);
    expect(schedule).toHaveLength(15);
  });

  it("1专家 → 5 条目", () => {
    const schedule = createSchedule(["solo"]);
    expect(schedule).toHaveLength(5);
  });

  it("0专家 → 空列表", () => {
    const schedule = createSchedule([]);
    expect(schedule).toHaveLength(0);
  });

  it("调度顺序正确：round 升序、index 升序", () => {
    const schedule = createSchedule(["a", "b"]);
    expect(schedule[0]).toEqual({ round: 0, expertId: "a", index: 0 });
    expect(schedule[1]).toEqual({ round: 0, expertId: "b", index: 1 });
    expect(schedule[2]).toEqual({ round: 1, expertId: "a", index: 0 });
    expect(schedule[3]).toEqual({ round: 1, expertId: "b", index: 1 });
    expect(schedule[9]).toEqual({ round: 4, expertId: "b", index: 1 });
  });
});

// ===== getRemainingSchedule 测试 =====

describe("getRemainingSchedule: 剩余调度", () => {
  const schedule = createSchedule(["a", "b", "c"]);

  it("从 round=0 index=0 开始 → 全部 15 条目", () => {
    const remaining = getRemainingSchedule(schedule, 0, 0);
    expect(remaining).toHaveLength(15);
  });

  it("从 round=1 index=1 开始 → 7 条目", () => {
    // round 1: index 1, 2 → 2 条目
    // round 2-4: 各 3 条目 → 9 条目
    // 实际：round 1 从 index 1 开始 = 2, round 2-4 = 3*3 = 9, total = 11... let me recalculate
    // round 1: index 1, 2 → 2 条目
    // round 2: index 0, 1, 2 → 3 条目
    // round 3: index 0, 1, 2 → 3 条目
    // round 4: index 0, 1, 2 → 3 条目
    // total = 2 + 3 + 3 + 3 = 11
    const remaining = getRemainingSchedule(schedule, 1, 1);
    expect(remaining).toHaveLength(11);
  });

  it("从 round=4 index=2 开始 → 1 条目（最后一个）", () => {
    const remaining = getRemainingSchedule(schedule, 4, 2);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toEqual({ round: 4, expertId: "c", index: 2 });
  });
});

// ===== isLastEntry 测试 =====

describe("isLastEntry: 最后一个调度条目", () => {
  it("最后一个条目 → true", () => {
    const schedule = createSchedule(["a", "b"]);
    const last = schedule[schedule.length - 1];
    expect(isLastEntry(last, schedule)).toBe(true);
  });

  it("非最后一个条目 → false", () => {
    const schedule = createSchedule(["a", "b"]);
    const first = schedule[0];
    expect(isLastEntry(first, schedule)).toBe(false);
  });
});
