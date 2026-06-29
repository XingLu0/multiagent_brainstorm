import type { LanguageModel, EmbeddingModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { ProviderRegistry } from "@/lib/providers/registry";

/**
 * LLM 配置接口
 */
export interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTokens: number;
  temperature: number;
  searchApiKey: string;
  /** Provider 类型，默认 "openai-compatible" */
  providerType?: string;
  /** DEF-03: 独立的 Embedding 端点配置 */
  embeddingBaseURL?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
}

/**
 * 解析 LLM 配置：环境变量优先 → 用户输入回退 → 默认值
 */
export function resolveLLMConfig(
  userConfig?: Partial<LLMConfig>
): LLMConfig {
  const providerType =
    process.env.LLM_PROVIDER || userConfig?.providerType || "openai-compatible";

  const isOllama = providerType === "ollama";

  return {
    apiKey: isOllama
      ? (process.env.LLM_API_KEY || userConfig?.apiKey || "ollama")
      : (process.env.LLM_API_KEY || userConfig?.apiKey || ""),
    baseURL: isOllama
      ? (process.env.LLM_BASE_URL || userConfig?.baseURL || "http://localhost:11434/v1")
      : (process.env.LLM_BASE_URL || userConfig?.baseURL || "https://api.openai.com/v1"),
    model:
      process.env.LLM_MODEL || userConfig?.model || "gpt-4o-mini",
    maxTokens:
      parseInt(process.env.LLM_MAX_TOKENS || "") ||
      userConfig?.maxTokens ||
      2048,
    temperature:
      parseFloat(process.env.LLM_TEMPERATURE || "") ||
      userConfig?.temperature ||
      0.7,
    searchApiKey:
      process.env.TAVILY_API_KEY || userConfig?.searchApiKey || "",
    providerType,
    embeddingBaseURL:
      process.env.EMBEDDING_BASE_URL || userConfig?.embeddingBaseURL || undefined,
    embeddingApiKey:
      process.env.EMBEDDING_API_KEY || userConfig?.embeddingApiKey || undefined,
    embeddingModel:
      process.env.EMBEDDING_MODEL || userConfig?.embeddingModel || "text-embedding-3-small",
  };
}

/**
 * 默认 LLM 调用设置：超时 + 重试
 * 所有 streamText 调用应展开此配置
 */
export const DEFAULT_CALL_SETTINGS = {
  timeout: { totalMs: 90_000 } as const,
  maxRetries: 2,
};

/**
 * 专家调用设置：更宽松的超时（因可能有工具调用）
 */
export const EXPERT_CALL_SETTINGS = {
  timeout: { totalMs: 120_000 } as const,
  maxRetries: 2,
};

/**
 * 创建 LLM 模型实例（工厂函数）
 * 委托给 ProviderRegistry，按 providerType 分发到对应 Provider 工厂
 */
export function createLLMModel(config: LLMConfig): LanguageModel {
  return ProviderRegistry.create(config);
}

/**
 * P2-2: 创建 Embedding 模型实例
 * DEF-03: 支持独立的 embedding 端点配置，fallback 到聊天 LLM 配置
 *
 * 当 embeddingBaseURL/embeddingApiKey 配置时使用独立端点，
 * 否则 fallback 到聊天 LLM 的 baseURL/apiKey（可能不支持 embeddings）。
 */
export function createEmbeddingModel(config: LLMConfig): EmbeddingModel {
  const baseURL = config.embeddingBaseURL || config.baseURL;
  const apiKey = config.embeddingApiKey || config.apiKey;
  const modelName = config.embeddingModel || "text-embedding-3-small";
  const openai = createOpenAI({ baseURL, apiKey });
  return openai.embedding(modelName);
}
