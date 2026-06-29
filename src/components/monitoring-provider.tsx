/**
 * 监控 Provider
 *
 * 在客户端应用启动时初始化 Sentry React SDK。
 * 包裹在根 layout 中，对子组件透明。
 */

"use client";

import { useEffect, type ReactNode } from "react";
import { initClientMonitoring } from "@/lib/monitoring-client";

export function MonitoringProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initClientMonitoring();
  }, []);

  return <>{children}</>;
}
