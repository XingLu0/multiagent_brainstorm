import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

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
}

/**
 * 解析 LLM 配置：环境变量优先 → 用户输入回退 → 默认值
 */
export function resolveLLMConfig(
  userConfig?: Partial<LLMConfig>
): LLMConfig {
  return {
    apiKey:
      process.env.LLM_API_KEY || userConfig?.apiKey || "",
    baseURL:
      process.env.LLM_BASE_URL ||
      userConfig?.baseURL ||
      "https://api.openai.com/v1",
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
 * 封装 createOpenAI + 自定义 fetch 中间件
 */
export function createLLMModel(config: LLMConfig): LanguageModel {
  const openai = createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    fetch: async (input, init) => {
      let finalInit = init;
      if (init?.method === "POST" && typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body);

          // 仅对 DeepSeek V4 系列模型注入 enable_thinking=false
          if (
            typeof body.model === "string" &&
            body.model.startsWith("deepseek-v4")
          ) {
            body.enable_thinking = false;
            finalInit = { ...init, body: JSON.stringify(body) };
          }

          // 为 MiMo 模型关闭深度思考（Thinking Mode）
          // 多轮工具调用时要求回传 reasoning_content，AI SDK 不回传会导致 400 错误
          if (
            typeof body.model === "string" &&
            body.model.startsWith("mimo-")
          ) {
            body.thinking = { type: "disabled" };
            finalInit = { ...init, body: JSON.stringify(body) };
          }
        } catch {
          // JSON 解析失败，原样转发请求
        }
      }
      return fetch(input, finalInit);
    },
  });

  // 使用 .chat() 强制 Chat Completions API
  return openai.chat(config.model);
}
