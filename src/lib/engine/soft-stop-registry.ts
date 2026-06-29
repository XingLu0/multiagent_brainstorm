/**
 * 软停止注册表 — 模块级 Map，用于跨请求共享讨论 Actor。
 *
 * 背景：每个 API 请求创建独立的 Engine 实例，但软停止需要
 * 从独立的 API 路由访问正在运行的 SSE 流中的状态机 Actor。
 * 通过注册表实现跨请求通信。
 */

import type { Actor } from "xstate";
import type { discussionMachine } from "./discussion-machine";

type DiscussionActor = Actor<typeof discussionMachine>;

const activeActors = new Map<string, DiscussionActor>();

/**
 * 注册讨论 Actor（在 runExpertDiscussion 开始时调用）
 */
export function registerDiscussionActor(projectId: string, actor: DiscussionActor): void {
  activeActors.set(projectId, actor);
}

/**
 * 注销讨论 Actor（在 runExpertDiscussion 结束时调用）
 */
export function unregisterDiscussionActor(projectId: string): void {
  activeActors.delete(projectId);
}

/**
 * 触发软停止：向正在运行的讨论 Actor 发送 SOFT_STOP 事件。
 * @returns true 如果找到并发送了事件，false 如果没有活跃的讨论
 */
export function triggerSoftStop(projectId: string): boolean {
  const actor = activeActors.get(projectId);
  if (!actor) return false;
  actor.send({ type: "SOFT_STOP" });
  return true;
}
