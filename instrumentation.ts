/**
 * Next.js Instrumentation 钩子
 *
 * 在服务端启动时初始化错误监控。
 * 仅在 Node.js runtime 下执行。
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServerMonitoring } = await import("@/lib/monitoring");
    initServerMonitoring();
  }
}
