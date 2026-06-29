/**
 * DEF-03: Embedding 配置单元测试
 *
 * 验证 LLMConfig 的 embedding 字段、resolveLLMConfig 的环境变量解析、
 * createEmbeddingModel 的独立配置 fallback 逻辑。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock createOpenAI
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({
    chat: vi.fn(() => ({})),
    embedding: vi.fn(() => ({})),
  })),
}));

// Mock ProviderRegistry
vi.mock("@/lib/providers/registry", () => ({
  ProviderRegistry: {
    create: vi.fn(() => ({})),
  },
}));

import { createOpenAI } from "@ai-sdk/openai";
import { resolveLLMConfig, createEmbeddingModel, type LLMConfig } from "@/lib/llm";

const mockCreateOpenAI = vi.mocked(createOpenAI);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DEF-03: LLMConfig embedding 字段", () => {
  it("LLMConfig 接口包含 embedding 字段", () => {
    const config: LLMConfig = {
      apiKey: "key",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
      embeddingBaseURL: "https://embed.example.com/v1",
      embeddingApiKey: "embed-key",
      embeddingModel: "text-embedding-3-large",
    };
    expect(config.embeddingBaseURL).toBe("https://embed.example.com/v1");
    expect(config.embeddingApiKey).toBe("embed-key");
    expect(config.embeddingModel).toBe("text-embedding-3-large");
  });

  it("embedding 字段为可选", () => {
    const config: LLMConfig = {
      apiKey: "key",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
    };
    expect(config.embeddingBaseURL).toBeUndefined();
    expect(config.embeddingApiKey).toBeUndefined();
    expect(config.embeddingModel).toBeUndefined();
  });
});

describe("DEF-03: resolveLLMConfig embedding 解析", () => {
  it("环境变量 EMBEDDING_BASE_URL 被正确解析", () => {
    vi.stubEnv("EMBEDDING_BASE_URL", "https://embed.env.com/v1");
    vi.stubEnv("EMBEDDING_API_KEY", "env-embed-key");
    vi.stubEnv("EMBEDDING_MODEL", "text-embedding-ada-002");

    const config = resolveLLMConfig();
    expect(config.embeddingBaseURL).toBe("https://embed.env.com/v1");
    expect(config.embeddingApiKey).toBe("env-embed-key");
    expect(config.embeddingModel).toBe("text-embedding-ada-002");

    vi.unstubAllEnvs();
  });

  it("用户配置 fallback 到默认 embeddingModel", () => {
    const config = resolveLLMConfig({});
    expect(config.embeddingModel).toBe("text-embedding-3-small");
  });

  it("未配置时 embeddingBaseURL/embeddingApiKey 为 undefined", () => {
    const config = resolveLLMConfig({});
    expect(config.embeddingBaseURL).toBeUndefined();
    expect(config.embeddingApiKey).toBeUndefined();
  });

  it("环境变量优先于用户配置", () => {
    vi.stubEnv("EMBEDDING_BASE_URL", "https://env.com/v1");
    const config = resolveLLMConfig({ embeddingBaseURL: "https://user.com/v1" });
    expect(config.embeddingBaseURL).toBe("https://env.com/v1");
    vi.unstubAllEnvs();
  });
});

describe("DEF-03: createEmbeddingModel 独立配置", () => {
  it("使用独立的 embedding 配置", () => {
    const config: LLMConfig = {
      apiKey: "chat-key",
      baseURL: "https://chat.example.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
      embeddingBaseURL: "https://embed.example.com/v1",
      embeddingApiKey: "embed-key",
      embeddingModel: "text-embedding-3-large",
    };

    createEmbeddingModel(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "https://embed.example.com/v1",
      apiKey: "embed-key",
    });
  });

  it("未配置 embedding 时 fallback 到聊天 LLM 配置", () => {
    const config: LLMConfig = {
      apiKey: "chat-key",
      baseURL: "https://chat.example.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
    };

    createEmbeddingModel(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "https://chat.example.com/v1",
      apiKey: "chat-key",
    });
  });

  it("使用默认 embeddingModel 当未配置时", () => {
    const config: LLMConfig = {
      apiKey: "key",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
    };

    const mockOpenAI = {
      embedding: vi.fn(() => ({})),
    };
    mockCreateOpenAI.mockReturnValueOnce(mockOpenAI as any);

    createEmbeddingModel(config);

    expect(mockOpenAI.embedding).toHaveBeenCalledWith("text-embedding-3-small");
  });

  it("使用自定义 embeddingModel", () => {
    const config: LLMConfig = {
      apiKey: "key",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      maxTokens: 2048,
      temperature: 0.7,
      searchApiKey: "",
      embeddingModel: "text-embedding-3-large",
    };

    const mockOpenAI = {
      embedding: vi.fn(() => ({})),
    };
    mockCreateOpenAI.mockReturnValueOnce(mockOpenAI as any);

    createEmbeddingModel(config);

    expect(mockOpenAI.embedding).toHaveBeenCalledWith("text-embedding-3-large");
  });
});
