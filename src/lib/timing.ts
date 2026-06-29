/**
 * 性能计时工具
 *
 * 使用 performance.now() 精确测量异步操作耗时。
 */

/**
 * 包裹异步函数，记录执行耗时
 *
 * @param label 计时标签（用于日志识别）
 * @param fn 要执行的异步函数
 * @returns fn 的返回值
 */
export async function withTiming<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = Math.round(performance.now() - start);
    console.log(`[Timing] ${label}: ${duration}ms`);
    return result;
  } catch (e) {
    const duration = Math.round(performance.now() - start);
    console.error(`[Timing] ${label} FAILED (${duration}ms):`, e);
    throw e;
  }
}
