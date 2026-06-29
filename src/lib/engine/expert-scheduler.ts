/**
 * 专家调度器
 *
 * 从 brainstorm-engine.ts 提取的纯函数模块：
 * - createSchedule: 生成专家发言顺序的扁平调度列表
 * - shouldPause: 暂停检测逻辑
 * - shouldAutoSummarize: 自动总结检测逻辑
 */

import { MAX_EXPERT_ROUNDS, PAUSE_AFTER_EXPERT_TURNS, AUTO_SUMMARY_INTERVAL } from "./constants";

/**
 * 调度条目：表示某轮某位专家的发言任务
 */
export interface ScheduleEntry {
  round: number;
  expertId: string;
  index: number;
}

/**
 * 生成专家发言顺序的扁平调度列表
 *
 * @param expertIds 参与讨论的专家 ID 列表
 * @param maxRounds 最大讨论轮次（默认 MAX_EXPERT_ROUNDS）
 * @returns 调度条目数组，按 round 升序、index 升序排列
 */
export function createSchedule(
  expertIds: string[],
  maxRounds: number = MAX_EXPERT_ROUNDS
): ScheduleEntry[] {
  if (expertIds.length === 0) return [];

  const schedule: ScheduleEntry[] = [];
  for (let round = 0; round < maxRounds; round++) {
    for (let i = 0; i < expertIds.length; i++) {
      schedule.push({ round, expertId: expertIds[i], index: i });
    }
  }
  return schedule;
}

/**
 * 暂停检测：判断是否应该在当前专家发言后暂停
 *
 * 条件：达到 PAUSE_AFTER_EXPERT_TURNS 阈值 且 还有剩余轮次
 *
 * @param completedTurns 已完成的专家发言轮次数
 * @param pauseBase 暂停基线（从上次暂停点恢复后的已完成轮次）
 * @param totalTurns 总轮次数
 * @returns 是否应该暂停
 */
export function shouldPause(
  completedTurns: number,
  pauseBase: number,
  totalTurns: number
): boolean {
  return (
    completedTurns - pauseBase >= PAUSE_AFTER_EXPERT_TURNS &&
    completedTurns < totalTurns
  );
}

/**
 * 自动总结检测：判断当前轮次是否需要触发自动总结
 *
 * @param turnCount 当前项目轮次计数
 * @returns 是否应该触发自动总结
 */
export function shouldAutoSummarize(turnCount: number): boolean {
  return turnCount % AUTO_SUMMARY_INTERVAL === 0;
}

/**
 * 判断是否是最后一个调度条目
 */
export function isLastEntry(
  entry: ScheduleEntry,
  schedule: ScheduleEntry[]
): boolean {
  return schedule.indexOf(entry) === schedule.length - 1;
}

/**
 * 获取从指定位置开始的剩余调度条目
 *
 * @param schedule 完整调度列表
 * @param startRound 起始轮次
 * @param startIndex 起始索引（仅对 startRound 有效）
 * @returns 过滤后的调度子列表
 */
export function getRemainingSchedule(
  schedule: ScheduleEntry[],
  startRound: number,
  startIndex: number
): ScheduleEntry[] {
  return schedule.filter(
    (entry) =>
      entry.round > startRound ||
      (entry.round === startRound && entry.index >= startIndex)
  );
}
