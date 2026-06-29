/**
 * 引擎常量集中定义
 *
 * 从 brainstorm-engine.ts 提取的所有魔法数字，
 * 供 conversation-manager / expert-scheduler / discussion-machine 等模块共享。
 */

/** 上下文保留的最大轮次（hostAgent.guide 的 history.slice 参数） */
export const MAX_CONTEXT_ROUNDS = 20;

/** 自动总结间隔（每 N 轮触发一次阶段总结） */
export const AUTO_SUMMARY_INTERVAL = 4;

/** 专家最大讨论轮次 */
export const MAX_EXPERT_ROUNDS = 5;

/** 达到多少轮次后自动暂停（从 pauseBase 起算） */
export const PAUSE_AFTER_EXPERT_TURNS = 5;

/** 上下文压缩阈值：消息数超过此值时触发摘要压缩 */
export const CONTEXT_COMPRESS_THRESHOLD = 20;

/** 压缩后保留的最近消息条数 */
export const CONTEXT_RECENT_KEEP = 10;

/** 快照创建间隔：每 N 条消息自动创建状态快照 */
export const SNAPSHOT_INTERVAL = 20;
