/**
 * P2-3: 专家长期记忆单元测试
 *
 * 验证 extractMemoryFromDiscussion、queryExpertMemory、injectMemoryIntoPrompt
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    expertMemory: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock ai module
vi.mock("ai", () => ({
  generateText: vi.fn(),
  embedMany: vi.fn(),
}));

// Mock experts definitions
vi.mock("@/lib/experts/definitions", () => ({
  getExpertById: vi.fn().mockResolvedValue({ id: "architect", name: "技术架构师" }),
}));

import { prisma } from "@/lib/prisma";
import {
  extractMemoryFromDiscussion,
  queryExpertMemory,
  injectMemoryIntoPrompt,
  generateMemoryEmbeddings,
} from "../expert-memory";

const mockFindMany = vi.mocked(prisma.expertMemory.findMany);
const mockCreateMany = vi.mocked(prisma.expertMemory.createMany);
const mockUpdate = vi.mocked(prisma.expertMemory.update);

const aiModule = await import("ai");
const mockEmbedMany = vi.mocked(aiModule.embedMany);
const mockGenerateText = vi.mocked(aiModule.generateText);

const mockEmbeddingModel = {
  modelId: "text-embedding-3-small",
  specificationVersion: "v1",
  provider: "openai",
} as any;

const mockModel = { modelId: "test-model" } as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== extractMemoryFromDiscussion 测试 =====

describe("expert-memory: extractMemoryFromDiscussion", () => {
  it("TU-P2-3-01: 提取记忆并保存", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify([
        { category: "insight", content: "微服务的核心是组织架构对齐" },
        { category: "preference", content: "偏好TypeScript静态类型" },
      ]),
    } as any);

    // findMany 返回空数组（无已有记忆，去重通过）
    mockFindMany.mockResolvedValue([] as any);
    mockCreateMany.mockResolvedValue({ count: 2 } as any);

    const result = await extractMemoryFromDiscussion(
      mockModel, "architect", "技术架构师", "讨论上下文", "project-1"
    );

    expect(result).toBe(2);
    expect(mockCreateMany).toHaveBeenCalled();
  });

  it("TU-P2-3-02: generateMemoryEmbeddings 生成向量并更新数据库", async () => {
    // findMany 返回无 embedding 的记忆条目
    mockFindMany.mockResolvedValue([
      { id: "m1", content: "架构决策应考虑团队规模" },
    ] as any);

    mockEmbedMany.mockResolvedValue({
      embeddings: [[0.1, 0.2]],
    } as any);

    const result = await generateMemoryEmbeddings("architect", mockEmbeddingModel);

    expect(result).toBe(1);
    expect(mockEmbedMany).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { embedding: JSON.stringify([0.1, 0.2]) },
    });
  });

  it("TU-P2-3-03: 不传 embeddingModel 时不生成向量", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify([
        { category: "insight", content: "DDD 需要领域专家参与" },
      ]),
    } as any);

    mockFindMany.mockResolvedValue([] as any);
    mockCreateMany.mockResolvedValue({ count: 1 } as any);

    await extractMemoryFromDiscussion(
      mockModel, "architect", "技术架构师", "讨论上下文", "project-1"
    );

    expect(mockEmbedMany).not.toHaveBeenCalled();
  });

  it("TU-P2-3-04: 去重逻辑 — 已有记忆不重复保存", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify([
        { category: "insight", content: "已有记忆" },
        { category: "preference", content: "新记忆" },
      ]),
    } as any);

    // findMany 返回已有记忆
    mockFindMany.mockResolvedValue([{ content: "已有记忆" }] as any);
    mockCreateMany.mockResolvedValue({ count: 1 } as any);

    const result = await extractMemoryFromDiscussion(
      mockModel, "architect", "技术架构师", "讨论上下文", "project-1"
    );

    // 只有1条新记忆
    expect(result).toBe(1);
    // createMany 的 data 应该只有1条
    const createCall = mockCreateMany.mock.calls[0]?.[0] as any;
    expect(createCall.data).toHaveLength(1);
    expect(createCall.data[0].content).toBe("新记忆");
  });

  it("TU-P2-3-09: LLM 失败时静默返回 0", async () => {
    mockGenerateText.mockRejectedValue(new Error("API error"));

    const result = await extractMemoryFromDiscussion(
      mockModel, "architect", "技术架构师", "讨论上下文", "project-1"
    );

    expect(result).toBe(0);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});

// ===== queryExpertMemory 测试 =====

describe("expert-memory: queryExpertMemory", () => {
  it("TU-P2-3-05: 语义检索返回 top-K 结果", async () => {
    mockEmbedMany.mockResolvedValue({
      embeddings: [[0.9, 0.1]],
    } as any);

    mockFindMany.mockResolvedValue([
      { id: "m1", content: "微服务架构核心", category: "insight", embedding: JSON.stringify([0.95, 0.05]) },
      { id: "m2", content: "单体架构简单", category: "preference", embedding: JSON.stringify([0.1, 0.9]) },
    ] as any);

    const result = await queryExpertMemory("architect", "微服务", mockEmbeddingModel);

    expect(result).toContain("微服务");
    expect(mockEmbedMany).toHaveBeenCalled();
  });

  it("TU-P2-3-06: 无 embedding 时降级为按时间排序", async () => {
    // 不传 embeddingModel，直接走降级路径
    mockFindMany.mockResolvedValue([
      { content: "最近的记忆1" },
      { content: "最近的记忆2" },
    ] as any);

    const result = await queryExpertMemory("architect", "测试查询");

    expect(result).toContain("最近的记忆1");
    expect(result).toContain("最近的记忆2");
    expect(mockEmbedMany).not.toHaveBeenCalled();
  });

  it("TU-P2-3-07: 无记忆时返回空字符串", async () => {
    mockFindMany.mockResolvedValue([] as any);

    const result = await queryExpertMemory("architect", "测试查询");

    expect(result).toBe("");
  });
});

// ===== injectMemoryIntoPrompt 测试 =====

describe("expert-memory: injectMemoryIntoPrompt", () => {
  it("TU-P2-3-08: 格式化记忆段落", async () => {
    // 不传 embeddingModel，走降级路径
    mockFindMany.mockResolvedValue([
      { content: "架构决策需要考虑可扩展性" },
    ] as any);

    const result = await injectMemoryIntoPrompt("architect", "架构设计");

    expect(result).toContain("【专家历史记忆】");
    expect(result).toContain("架构决策需要考虑可扩展性");
  });

  it("无记忆时返回空字符串", async () => {
    mockFindMany.mockResolvedValue([] as any);

    const result = await injectMemoryIntoPrompt("architect", "测试");

    expect(result).toBe("");
  });
});
