import type { LanguageModel } from "ai";
import type { LLMConfig } from "@/lib/llm";
import { createOpenAICompatibleModel } from "./openai-compatible";
import { createAnthropicModel } from "./anthropic";
import { createOllamaModel } from "./ollama";

/**
 * Provider 类型枚举
 */
export type ProviderType = "openai-compatible" | "anthropic" | "ollama";

/**
 * Provider 工厂函数签名
 */
export type ProviderFactory = (config: LLMConfig) => LanguageModel;

/**
 * Provider 注册表
 *
 * 按 config.providerType 分发到不同 createXxx() 工厂。
 * Agent 层仅依赖 LanguageModel 接口，对 Provider 切换透明。
 */
const registry = new Map<ProviderType, ProviderFactory>([
  ["openai-compatible", createOpenAICompatibleModel],
  ["anthropic", createAnthropicModel],
  ["ollama", createOllamaModel],
]);

export const ProviderRegistry = {
  /**
   * 根据 config.providerType 创建对应的 LLM 模型实例
   * 默认使用 "openai-compatible"（向后兼容）
   */
  create(config: LLMConfig): LanguageModel {
    const providerType = (config.providerType ||
      "openai-compatible") as ProviderType;
    const factory = registry.get(providerType);
    if (!factory) {
      throw new Error(`未知的 Provider 类型: ${providerType}`);
    }
    return factory(config);
  },

  /**
   * 注册新的 Provider 工厂
   */
  register(type: ProviderType, factory: ProviderFactory): void {
    registry.set(type, factory);
  },

  /**
   * 获取所有已注册的 Provider 类型
   */
  getAvailableProviders(): ProviderType[] {
    return [...registry.keys()];
  },
};
