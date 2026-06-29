import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { LLMConfig } from "@/lib/llm";

/**
 * 构建 per-provider 的 fetch 中间件链
 * 处理 DeepSeek V4 (enable_thinking=false) 和 MiMo (thinking disabled) 的差异
 */
function buildFetchMiddleware(): typeof fetch {
  return async (input, init) => {
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
  };
}

/**
 * 创建 OpenAI 兼容的 LLM 模型实例
 * 封装 createOpenAI + 自定义 fetch 中间件（DeepSeek/MiMo thinking 模式处理）
 */
export function createOpenAICompatibleModel(config: LLMConfig): LanguageModel {
  const openai = createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    fetch: buildFetchMiddleware(),
  });

  // 使用 .chat() 强制 Chat Completions API（兼容国内 API）
  return openai.chat(config.model);
}
