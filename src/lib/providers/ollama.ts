/**
 * P3-4: Ollama 本地离线 Provider
 *
 * Ollama 提供 OpenAI 兼容 API (/v1/chat/completions)，
 * 默认运行在 http://localhost:11434/v1，无需真实 API Key。
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { LLMConfig } from "@/lib/llm";

/**
 * 创建 Ollama 本地模型实例
 *
 * @param config LLM 配置（baseURL 默认 http://localhost:11434/v1，apiKey 不需要真实值）
 * @returns LanguageModel 实例
 */
export function createOllamaModel(config: LLMConfig): LanguageModel {
  const baseURL = config.baseURL || "http://localhost:11434/v1";
  const openai = createOpenAI({
    baseURL,
    apiKey: "ollama", // Ollama 不需要真实 API Key，但 createOpenAI 要求非空
  });
  return openai.chat(config.model);
}
