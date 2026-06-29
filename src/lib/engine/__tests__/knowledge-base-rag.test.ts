/**
 * 知识库 RAG 功能单元测试
 *
 * P2-2: 验证 generateEmbeddings、queryKnowledgeSemantic、extractAndSaveKnowledge
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeEntry: {
      findMany: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock ai module
vi.mock("ai", () => ({
  generateText: vi.fn(),
  embedMany: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { generateEmbeddings, queryKnowledgeSemantic, extractAndSaveKnowledge } from "../knowledge-base";

// 获取 mock 引用
const mockFindMany = vi.mocked(prisma.knowledgeEntry.findMany);
const mockUpdate = vi.mocked(prisma.knowledgeEntry.update);
const mockCreateMany = vi.mocked(prisma.knowledgeEntry.createMany);
const mockCount = vi.mocked(prisma.knowledgeEntry.count);

// 动态导入 ai mock
const aiModule = await import("ai");
const mockEmbedMany = vi.mocked(aiModule.embedMany);
const mockGenerateText = vi.mocked(aiModule.generateText);

// Mock embedding model
const mockEmbeddingModel = {
  modelId: "text-embedding-3-small",
  specificationVersion: "v1",
  provider: "openai",
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== generateEmbeddings 测试 =====

describe("knowledge-base: generateEmbeddings", () => {
  it("TU-P2-2-11: 批量生成 embedding 并更新数据库", async () => {
    // Mock: 3 条没有 embedding 的知识条目
    mockFindMany.mockResolvedValue([
      { id: "entry-1", content: "共识知识1" },
      { id: "entry-2", content: "分歧知识1" },
      { id: "entry-3", content: "决策知识1" },
    ] as any);

    // Mock: embedMany 返回 3 个向量
    mockEmbedMany.mockResolvedValue({
      embeddings: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
    } as any);

    const result = await generateEmbeddings("project-1", mockEmbeddingModel);

    expect(result).toBe(3);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", embedding: null },
      select: { id: true, content: true },
    });
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(3);

    // 验证每条都被更新
    expect(mockUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "entry-1" },
      data: { embedding: JSON.stringify([0.1, 0.2]) },
    });
    expect(mockUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "entry-2" },
      data: { embedding: JSON.stringify([0.3, 0.4]) },
    });
    expect(mockUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: "entry-3" },
      data: { embedding: JSON.stringify([0.5, 0.6]) },
    });
  });

  it("无知识条目时返回 0", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await generateEmbeddings("project-1", mockEmbeddingModel);

    expect(result).toBe(0);
    expect(mockEmbedMany).not.toHaveBeenCalled();
  });

  it("embedding API 失败时返回 0 不抛异常", async () => {
    mockFindMany.mockResolvedValue([{ id: "entry-1", content: "test" }] as any);
    mockEmbedMany.mockRejectedValue(new Error("API not supported"));

    const result = await generateEmbeddings("project-1", mockEmbeddingModel);

    expect(result).toBe(0);
  });
});

// ===== queryKnowledgeSemantic 测试 =====

describe("knowledge-base: queryKnowledgeSemantic", () => {
  it("TU-P2-2-14: 语义检索返回格式化结果", async () => {
    // Mock: embedMany 返回查询向量
    mockEmbedMany.mockResolvedValue({
      embeddings: [[1, 0]],
    } as any);

    // Mock: findMany 返回有 embedding 的知识条目
    mockFindMany.mockResolvedValue([
      { id: "1", category: "consensus", content: "应该采用微服务架构", embedding: JSON.stringify([0.95, 0.05]) },
      { id: "2", category: "divergence", content: "单体架构更简单", embedding: JSON.stringify([0.1, 0.9]) },
      { id: "3", category: "decision", content: "决定使用 TypeScript", embedding: JSON.stringify([0.9, 0.1]) },
    ] as any);

    const result = await queryKnowledgeSemantic("project-1", "微服务架构选型", mockEmbeddingModel);

    // 应包含 top-K 结果（score >= 0.3）
    expect(result).toContain("共识");
    expect(result).toContain("微服务");
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("无 embedding 条目时降级为全量 dump", async () => {
    // Mock: embedMany 返回查询向量
    mockEmbedMany.mockResolvedValue({
      embeddings: [[1, 0]],
    } as any);

    // Mock: findMany 返回空（没有 embedding 条目）
    mockFindMany.mockResolvedValue([]);

    // Mock: queryKnowledge 的 count 返回 0
    mockCount.mockResolvedValue(0);

    const result = await queryKnowledgeSemantic("project-1", "test query", mockEmbeddingModel);

    // 降级为 queryKnowledge，返回空字符串
    expect(result).toBe("");
  });

  it("embedMany 失败时降级为全量 dump", async () => {
    mockEmbedMany.mockRejectedValue(new Error("API not supported"));
    mockCount.mockResolvedValue(0);

    const result = await queryKnowledgeSemantic("project-1", "test query", mockEmbeddingModel);

    // 降级为 queryKnowledge
    expect(result).toBe("");
  });
});

// ===== extractAndSaveKnowledge 测试 =====

describe("knowledge-base: extractAndSaveKnowledge", () => {
  it("TU-P2-2-12: 传入 embeddingModel 时同步生成向量", async () => {
    // Mock: generateText 返回有效的知识 JSON
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify([
        { category: "consensus", content: "团队同意使用 React" },
      ]),
    } as any);

    // Mock: createMany 返回成功
    mockCreateMany.mockResolvedValue({ count: 1 });

    // Mock: findMany 第一次返回空数组（saveKnowledgeEntries 去重查询，无已有条目）
    // 第二次返回新条目（generateEmbeddings 查询无 embedding 的条目）
    mockFindMany
      .mockResolvedValueOnce([])  // saveKnowledgeEntries 去重查询
      .mockResolvedValue([
        { id: "entry-1", content: "团队同意使用 React" },
      ] as any);
    mockEmbedMany.mockResolvedValue({
      embeddings: [[0.1, 0.2]],
    } as any);

    const mockModel = { modelId: "test-model" } as any;
    await extractAndSaveKnowledge(mockModel, "project-1", "讨论上下文", undefined, mockEmbeddingModel);

    // 验证 createMany 被调用（知识已保存）
    expect(mockCreateMany).toHaveBeenCalled();

    // 验证 generateEmbeddings 被调用（findMany 查询无 embedding 条目）
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", embedding: null },
      select: { id: true, content: true },
    });
  });

  it("TU-P2-2-13: 不传 embeddingModel 时不生成向量", async () => {
    // Mock: generateText 返回有效的知识 JSON
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify([
        { category: "consensus", content: "团队同意使用 Vue" },
      ]),
    } as any);

    mockCreateMany.mockResolvedValue({ count: 1 });

    const mockModel = { modelId: "test-model" } as any;
    await extractAndSaveKnowledge(mockModel, "project-1", "讨论上下文");

    // 验证 createMany 被调用
    expect(mockCreateMany).toHaveBeenCalled();

    // 验证 generateEmbeddings 未被调用（findMany 未被调用查询 embedding）
    expect(mockFindMany).not.toHaveBeenCalledWith({
      where: { projectId: "project-1", embedding: null },
      select: { id: true, content: true },
    });
  });
});
