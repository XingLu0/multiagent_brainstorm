/**
 * 服务端错误监控模块
 *
 * 基于 Sentry SDK（可选），通过 SENTRY_DSN 环境变量控制。
 * 未配置 DSN 时，所有操作降级为 console.error。
 */

import * as Sentry from "@sentry/node";

let initialized = false;

/**
 * 初始化服务端监控
 * 仅在 SENTRY_DSN 环境变量存在时初始化 Sentry
 */
export function initServerMonitoring(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 1.0,
  });
  initialized = true;
  console.log("[Monitoring] Sentry server initialized");
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
  console.error("[captureException]", error, context ?? "");
}

/**
 * 捕获消息并上报
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info"
): void {
  if (initialized) {
    Sentry.captureMessage(message, level);
  }
}
