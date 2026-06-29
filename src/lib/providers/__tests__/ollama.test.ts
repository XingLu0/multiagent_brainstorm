/**
 * P3-4: Ollama 离线模式单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @ai-sdk/openai
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({
    chat: vi.fn(() => ({ modelId: "ollama-model" })),
  })),
}));

import { createOpenAI } from "@ai-sdk/openai";
import { createOllamaModel } from "../ollama";
import { ProviderRegistry } from "../registry";
import { resolveLLMConfig } from "@/lib/llm";

const mockCreateOpenAI = vi.mocked(createOpenAI);

beforeEach(() => {
  vi.clearAllMocks();
  // 清除环境变量
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_BASE_URL;
});

describe("ollama: createOllamaModel", () => {
  it("TU-P3-4-01: 返回 LanguageModel 实例", () => {
    const config = {
      apiKey: "ollama",
      baseURL: "http://localhost:11434/v1",
      model: "llama3.2",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
      providerType: "ollama" as const,
    };

    const model = createOllamaModel(config);

    expect(model).toBeDefined();
    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama",
    });
  });

  it("TU-P3-4-02: 使用默认 baseURL", () => {
    const config = {
      apiKey: "ollama",
      baseURL: "", // 空字符串，应使用默认值
      model: "llama3.2",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
      providerType: "ollama" as const,
    };

    createOllamaModel(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "http://localhost:11434/v1",
      })
    );
  });

  it("TU-P3-4-03: 使用自定义 baseURL", () => {
    const config = {
      apiKey: "ollama",
      baseURL: "http://192.168.1.100:11434/v1",
      model: "qwen2.5",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
      providerType: "ollama" as const,
    };

    createOllamaModel(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "http://192.168.1.100:11434/v1",
      })
    );
  });
});

describe("ollama: ProviderRegistry", () => {
  it("TU-P3-4-04: 注册了 ollama 类型", () => {
    const providers = ProviderRegistry.getAvailableProviders();
    expect(providers).toContain("ollama");
  });

  it("TU-P3-4-05: create('ollama') 返回模型实例", () => {
    const config = {
      apiKey: "ollama",
      baseURL: "http://localhost:11434/v1",
      model: "llama3.2",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
      providerType: "ollama" as const,
    };

    const model = ProviderRegistry.create(config);
    expect(model).toBeDefined();
  });
});

describe("ollama: resolveLLMConfig", () => {
  it("TU-P3-4-06: ollama 模式 apiKey 默认为 'ollama'", () => {
    const config = resolveLLMConfig({ providerType: "ollama" });

    expect(config.providerType).toBe("ollama");
    expect(config.apiKey).toBe("ollama");
    expect(config.baseURL).toBe("http://localhost:11434/v1");
  });
});
