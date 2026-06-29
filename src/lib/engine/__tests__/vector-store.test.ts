/**
 * 向量存储与检索单元测试
 *
 * P2-2: 验证 cosineSimilarity、EmbeddingCache、retrieveTopK、fnv1aHash
 */

import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  EmbeddingCache,
  retrieveTopK,
  fnv1aHash,
  type KnowledgeEntryWithEmbedding,
} from "../vector-store";

// ===== 辅助函数 =====

/** 生成指定维度的随机向量 */
function randomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

/** 生成指定数量的 mock 知识条目（1536 维） */
function mockEntries(count: number, withEmbedding: boolean = true): KnowledgeEntryWithEmbedding[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${i}`,
    category: i % 2 === 0 ? "consensus" : "divergence",
    content: `知识条目 ${i}`,
    embedding: withEmbedding ? JSON.stringify(randomVector(1536)) : null,
  }));
}

// ===== cosineSimilarity 测试 =====

describe("vector-store: cosineSimilarity", () => {
  it("TU-P2-2-01: 相同向量返回 1.0", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("TU-P2-2-02: 正交向量返回 0.0", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("TU-P2-2-03: 反向向量返回 -1.0", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("TU-P2-2-04: 零向量返回 0.0（避免 NaN）", () => {
    const zero = [0, 0, 0];
    const v = [1, 2, 3];
    expect(cosineSimilarity(zero, v)).toBe(0);
    expect(cosineSimilarity(v, zero)).toBe(0);
    expect(cosineSimilarity(zero, zero)).toBe(0);
  });
});

// ===== EmbeddingCache 测试 =====

describe("vector-store: EmbeddingCache", () => {
  it("TU-P2-2-05: LRU 淘汰最旧条目", () => {
    const cache = new EmbeddingCache(3);
    cache.set("a", [1]);
    cache.set("b", [2]);
    cache.set("c", [3]);
    cache.set("d", [4]); // 超过 maxSize=3，淘汰 "a"

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toEqual([2]);
    expect(cache.get("c")).toEqual([3]);
    expect(cache.get("d")).toEqual([4]);
    expect(cache.size).toBe(3);
  });

  it("TU-P2-2-06: 命中已存在的 key 返回缓存值", () => {
    const cache = new EmbeddingCache(100);
    const vector = [1, 2, 3];
    cache.set("key1", vector);

    const result = cache.get("key1");
    expect(result).toEqual(vector);

    // 再次获取应该仍然存在（LRU 更新顺序）
    const result2 = cache.get("key1");
    expect(result2).toEqual(vector);
  });
});

// ===== retrieveTopK 测试 =====

describe("vector-store: retrieveTopK", () => {
  it("TU-P2-2-07: 返回 top-5 按分数降序", () => {
    const queryVec = [1, 0, 0];
    const entries: KnowledgeEntryWithEmbedding[] = [
      { id: "1", category: "consensus", content: "A", embedding: JSON.stringify([0.9, 0.1, 0]) },
      { id: "2", category: "consensus", content: "B", embedding: JSON.stringify([0.5, 0.5, 0]) },
      { id: "3", category: "divergence", content: "C", embedding: JSON.stringify([0.95, 0.05, 0]) },
      { id: "4", category: "consensus", content: "D", embedding: JSON.stringify([0.3, 0.7, 0]) },
      { id: "5", category: "divergence", content: "E", embedding: JSON.stringify([0.8, 0.2, 0]) },
      { id: "6", category: "consensus", content: "F", embedding: JSON.stringify([0.1, 0.9, 0]) },
    ];

    const results = retrieveTopK(entries, queryVec, 5, 0.0);
    expect(results).toHaveLength(5);
    // 验证降序
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
    // 最高分应接近 0.95
    expect(results[0].id).toBe("3");
  });

  it("TU-P2-2-08: 过滤低于 minScore 的条目", () => {
    const queryVec = [1, 0];
    const entries: KnowledgeEntryWithEmbedding[] = [
      { id: "1", category: "consensus", content: "high", embedding: JSON.stringify([0.99, 0.01]) },
      { id: "2", category: "consensus", content: "low", embedding: JSON.stringify([0.1, 0.9]) },
    ];

    // minScore=0.5 → 只有第一条通过
    const results = retrieveTopK(entries, queryVec, 5, 0.5);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  it("TU-P2-2-09: 空知识库返回空数组", () => {
    const results = retrieveTopK([], [1, 2, 3], 5, 0.3);
    expect(results).toEqual([]);
  });

  it("TU-P2-2-10: 跳过 embedding 为 null 的条目", () => {
    const queryVec = [1, 0];
    const entries: KnowledgeEntryWithEmbedding[] = [
      { id: "1", category: "consensus", content: "A", embedding: null },
      { id: "2", category: "consensus", content: "B", embedding: JSON.stringify([0.9, 0.1]) },
      { id: "3", category: "divergence", content: "C", embedding: null },
    ];

    const results = retrieveTopK(entries, queryVec, 5, 0.0);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("2");
  });
});

// ===== fnv1aHash 测试 =====

describe("vector-store: fnv1aHash", () => {
  it("相同文本返回相同哈希", () => {
    expect(fnv1aHash("hello world")).toBe(fnv1aHash("hello world"));
  });

  it("不同文本返回不同哈希", () => {
    expect(fnv1aHash("hello")).not.toBe(fnv1aHash("world"));
  });

  it("返回 16 进制字符串", () => {
    const hash = fnv1aHash("test");
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

// ===== 性能测试 =====

describe("vector-store: 性能测试", () => {
  it("TP-P2-2-01: 100 条知识检索 < 200ms", () => {
    const entries = mockEntries(100);
    const queryVec = randomVector(1536);

    const start = performance.now();
    retrieveTopK(entries, queryVec, 5, 0.3);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it("TP-P2-2-02: 500 条知识检索 < 500ms", () => {
    const entries = mockEntries(500);
    const queryVec = randomVector(1536);

    const start = performance.now();
    retrieveTopK(entries, queryVec, 5, 0.3);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it("TP-P2-2-03: LRU 缓存命中率 > 90%", () => {
    const cache = new EmbeddingCache(500);
    const keys = Array.from({ length: 100 }, (_, i) => `key-${i}`);
    const vector = [1, 2, 3];

    // 填充缓存
    keys.forEach((k) => cache.set(k, vector));

    // 100 次查询：90 次命中缓存，10 次未命中
    let hits = 0;
    let total = 0;
    for (let i = 0; i < 100; i++) {
      total++;
      const key = i < 90 ? keys[i % 100] : `miss-${i}`;
      if (cache.get(key) !== undefined) hits++;
    }

    const hitRate = hits / total;
    expect(hitRate).toBeGreaterThanOrEqual(0.9);
  });
});
