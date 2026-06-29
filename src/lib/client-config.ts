/**
 * 客户端 LLM 配置管理
 * 通过 localStorage 存储用户配置，通过 X-LLM-Config 请求头传递到服务端
 * 配置优先级：环境变量 > 用户页面输入 > 默认值（服务端 resolveLLMConfig 实现）
 */

export interface ClientLLMConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  searchApiKey?: string;
  /** Provider 类型，默认 "openai-compatible" */
  providerType?: string;
  /** DEF-03: 独立的 Embedding 端点配置 */
  embeddingBaseURL?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
}

const STORAGE_KEY = "ai-brainstorm-llm-config";
const CONFIG_HEADER = "X-LLM-Config";

/**
 * 从 localStorage 读取配置
 */
export function getLLMConfig(): ClientLLMConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ClientLLMConfig;
  } catch {
    return {};
  }
}

/**
 * 写入配置到 localStorage
 */
export function setLLMConfig(config: ClientLLMConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage 可能已满或被禁用
  }
}

/**
 * 清除配置
 */
export function clearLLMConfig(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * 返回 base64 编码的配置字符串（Unicode 安全）
 * 使用 TextEncoder 将 JSON 字符串转为 UTF-8 字节，再进行 base64 编码
 */
export function getLLMConfigHeader(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const config = getLLMConfig();
    // 检查是否有任何非空字段
    const hasValue = Object.values(config).some(
      (v) => v !== undefined && v !== null && v !== ""
    );
    if (!hasValue) return null;

    const json = JSON.stringify(config);
    // Unicode 安全的 base64 编码
    const bytes = new TextEncoder().encode(json);
    const binary = String.fromCharCode(...bytes);
    return btoa(binary);
  } catch {
    return null;
  }
}

/**
 * 封装 fetch，自动添加 X-LLM-Config 请求头
 * 不覆盖已有的 header（如 Content-Type）
 */
export async function fetchWithConfig(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const configHeader = getLLMConfigHeader();

  if (!configHeader) {
    // 没有用户配置，直接使用原生 fetch
    return fetch(url, options);
  }

  // 合并 headers
  const existingHeaders = options?.headers;
  const headers = new Headers(existingHeaders);
  headers.set(CONFIG_HEADER, configHeader);

  return fetch(url, {
    ...options,
    headers,
  });
}
