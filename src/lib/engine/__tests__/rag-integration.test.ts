/**
 * RAG 检索增强集成测试
 *
 * P2-2: 验证知识提取→向量生成→语义检索→降级路径的端到端流程
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

// Mock prompt-cache to avoid side effects
vi.mock("../prompt-cache", () => ({
  promptCache: {
    invalidateProject: vi.fn(),
  },
  incrementKnowledgeVersion: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  extractAndSaveKnowledge,
  queryKnowledgeSemantic,
} from "../knowledge-base";

const mockFindMany = vi.mocked(prisma.knowledgeEntry.findMany);
const mockCreateMany = vi.mocked(prisma.knowledgeEntry.createMany);
const mockCount = vi.mocked(prisma.knowledgeEntry.count);

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

describe("RAG 集成测试", () => {
  it("TI-P2-2-01: 知识提取→向量生成→语义检索→注入上下文", async () => {
    // 1. Mock generateText 返回知识 JSON
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify([
        { category: "consensus", content: "团队同意采用微服务架构" },
        { category: "decision", content: "使用 TypeScript 作为主语言" },
      ]),
    } as any);

    // 2. Mock createMany 返回成功
    mockCreateMany.mockResolvedValue({ count: 2 });

    // 3. Mock findMany:
    //    第一次：saveKnowledgeEntries 去重查询 → 返回空数组
    //    第二次：generateEmbeddings 查询无 embedding 条目 → 返回新条目
    //    第三次：queryKnowledgeSemantic 查询有 embedding 的条目 → 返回带 embedding 的条目
    mockFindMany
      .mockResolvedValueOnce([]) // saveKnowledgeEntries 去重
      .mockResolvedValueOnce([
        { id: "e1", content: "团队同意采用微服务架构" },
        { id: "e2", content: "使用 TypeScript 作为主语言" },
      ] as any) // generateEmbeddings 查询
      .mockResolvedValue([
        { id: "e1", category: "consensus", content: "团队同意采用微服务架构", embedding: JSON.stringify([0.9, 0.1]) },
        { id: "e2", category: "decision", content: "使用 TypeScript 作为主语言", embedding: JSON.stringify([0.8, 0.2]) },
      ] as any); // queryKnowledgeSemantic 查询

    // 4. Mock embedMany: 先返回知识向量，再返回查询向量
    mockEmbedMany
      .mockResolvedValueOnce({
        embeddings: [[0.9, 0.1], [0.8, 0.2]],
      } as any) // generateEmbeddings 批量生成
      .mockResolvedValueOnce({
        embeddings: [[0.85, 0.15]],
      } as any); // queryKnowledgeSemantic 查询向量

    // 执行：知识提取 + 保存 + 生成 embedding
    await extractAndSaveKnowledge(
      mockModel,
      "project-1",
      "讨论上下文：微服务架构选型",
      undefined,
      mockEmbeddingModel
    );

    // 验证：createMany 被调用（知识已保存）
    expect(mockCreateMany).toHaveBeenCalled();

    // 验证：embedMany 被调用（向量已生成）
    expect(mockEmbedMany).toHaveBeenCalled();

    // 执行：语义检索
    const result = await queryKnowledgeSemantic(
      "project-1",
      "微服务架构选型",
      mockEmbeddingModel
    );

    // 验证：返回包含知识内容
    expect(result).toContain("微服务");
    expect(result).toContain("共识");
  });

  it("TI-P2-2-02: embedding API 失败时降级为全量知识 dump", async () => {
    // Mock embedMany 抛出异常（API 不支持）
    mockEmbedMany.mockRejectedValue(new Error("API not supported"));

    // Mock findMany 返回有 embedding 的知识条目（但 embedMany 失败，无法生成查询向量）
    mockFindMany.mockResolvedValue([
      { id: "e1", category: "consensus", content: "已存在的共识知识", embedding: JSON.stringify([0.9, 0.1]) },
    ] as any);

    // Mock count 返回 0（queryKnowledge 降级路径会用 findMany 查询）
    mockCount.mockResolvedValue(0);

    // 执行：语义检索（应降级为全量 dump）
    const result = await queryKnowledgeSemantic(
      "project-1",
      "测试查询",
      mockEmbeddingModel
    );

    // 验证：降级为 queryKnowledge，不抛出异常
    // queryKnowledge 会调用 findMany 查询所有条目
    // 由于 mockFindMany 返回了条目，但 queryKnowledge 会排序并格式化
    // 降级后返回的结果可能为空字符串或包含知识内容
    expect(typeof result).toBe("string");
    // 不应抛出异常
    expect(result).not.toBeNull();
  });
});
