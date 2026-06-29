import { createLLMModel, createEmbeddingModel, resolveLLMConfig, type LLMConfig } from "@/lib/llm";
import { BrainstormEngine } from "@/lib/engine/brainstorm-engine";

const CONFIG_HEADER = "X-LLM-Config";

/**
 * 从请求头提取用户配置（base64 编码的 JSON）
 */
export function extractUserConfigFromRequest(
  request: Request
): Partial<LLMConfig> | undefined {
  const header = request.headers.get(CONFIG_HEADER);
  if (!header) return undefined;
  try {
    const json = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(json) as Partial<LLMConfig>;
  } catch {
    return undefined;
  }
}

/**
 * 解析配置：环境变量优先 → 用户输入回退 → 默认值
 */
export function resolveConfigFromRequest(request: Request): LLMConfig {
  return resolveLLMConfig(extractUserConfigFromRequest(request));
}

/**
 * 从请求创建 BrainstormEngine 实例
 */
export function createEngineFromRequest(request: Request): BrainstormEngine {
  const config = resolveConfigFromRequest(request);
  const model = createLLMModel(config);
  // P2-2: 创建 embedding 模型（API 不支持时静默降级为全量 dump）
  let embeddingModel;
  try {
    embeddingModel = createEmbeddingModel(config);
  } catch {
    embeddingModel = undefined;
  }
  return new BrainstormEngine(model, config, config.searchApiKey, embeddingModel);
}
