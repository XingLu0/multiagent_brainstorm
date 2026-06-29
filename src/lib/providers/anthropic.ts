import type { LanguageModel } from "ai";
import type { LLMConfig } from "@/lib/llm";

/**
 * 创建 Anthropic LLM 模型实例
 *
 * P0 阶段占位：抛出明确错误，后续版本通过 @ai-sdk/anthropic 接入。
 */
export function createAnthropicModel(_config: LLMConfig): LanguageModel {
  throw new Error(
    "Anthropic Provider 尚未实现，请在设置页选择「OpenAI 兼容」类型。" +
      "Anthropic 支持将在后续版本中通过 @ai-sdk/anthropic 接入。"
  );
}
