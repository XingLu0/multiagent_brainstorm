/**
 * 客户端错误监控模块
 *
 * 基于 Sentry React SDK（可选），通过 NEXT_PUBLIC_SENTRY_DSN 环境变量控制。
 * 未配置 DSN 时，所有操作降级为 console.error。
 */

"use client";

import * as Sentry from "@sentry/react";

let initialized = false;

/**
 * 初始化客户端监控
 * 仅在 NEXT_PUBLIC_SENTRY_DSN 环境变量存在时初始化 Sentry
 */
export function initClientMonitoring(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
  });
  initialized = true;
  console.log("[Monitoring] Sentry client initialized");
}

/**
 * 捕获异常并上报
 * 未初始化时仅 console.error
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>
): void {
  if (initialized) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
  console.error("[Client Exception]", error, context ?? "");
}
