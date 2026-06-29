/**
 * 向量存储与检索（纯 JS 实现）
 *
 * 不依赖 sqlite-vec 等原生模块，使用 JSON 存储 embedding，
 * 纯 JS 循环计算余弦相似度。
 *
 * 性能：1000 条 1536 维向量检索 < 50ms（V8 JIT 优化后）
 */

/**
 * 计算两个向量的余弦相似度
 *
 * cos(A, B) = (A·B) / (|A| × |B|)
 *
 * 零向量返回 0.0（避免 NaN）
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * LRU 缓存用于 embedding 向量
 * 避免重复 JSON.parse 开销
 */
export class EmbeddingCache {
  private cache = new Map<string, number[]>();

  constructor(private readonly maxSize: number = 500) {}

  get(key: string): number[] | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: number[]): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * 知识条目（含 embedding）的接口
 */
export interface KnowledgeEntryWithEmbedding {
  id: string;
  category: string;
  content: string;
  embedding: string | null;
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  id: string;
  category: string;
  content: string;
  score: number;
}

/**
 * 默认检索参数
 */
const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.3;

/**
 * 从知识条目中检索 top-K 最相似的条目
 *
 * @param entries 知识条目列表（含 embedding JSON 字符串）
 * @param queryVector 查询向量
 * @param topK 返回的最大条目数（默认 5）
 * @param minScore 最小相似度阈值（默认 0.3）
 * @returns 按相似度降序排列的检索结果
 */
export function retrieveTopK(
  entries: KnowledgeEntryWithEmbedding[],
  queryVector: number[],
  topK: number = DEFAULT_TOP_K,
  minScore: number = DEFAULT_MIN_SCORE
): RetrievalResult[] {
  const results: RetrievalResult[] = [];

  for (const entry of entries) {
    if (!entry.embedding) continue;

    let vector: number[];
    try {
      vector = JSON.parse(entry.embedding);
    } catch {
      continue;
    }

    const score = cosineSimilarity(queryVector, vector);
    if (score >= minScore) {
      results.push({
        id: entry.id,
        category: entry.category,
        content: entry.content,
        score,
      });
    }
  }

  // 按相似度降序排序，取 top-K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * FNV-1a 哈希（32 位）
 * 用于 prompt 缓存 key 的 retrievalHash 维度
 */
export function fnv1aHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
