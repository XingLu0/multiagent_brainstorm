/**
 * System Prompt LRU 缓存
 *
 * 缓存 key = projectId:expertId:knowledgeVersion:requireHook:phase:dateStr
 * - knowledgeVersion: 知识库更新时递增，使缓存失效
 * - requireHook: 是否需要 [HOOK] 结尾（影响 prompt 内容）
 * - phase: 发散/收敛阶段（影响 prompt 内容）
 * - dateStr: 日期部分（仅日期，不含时间），确保跨天时缓存自动失效
 *
 * 缓存 value = 构建好的 system prompt 字符串
 */

/**
 * LRU 缓存实现（基于 Map 的插入顺序）
 */
export class LRUPromptCache {
  private cache = new Map<string, string>();

  constructor(private readonly maxSize: number = 100) {}

  get(key: string): string | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移到末尾（最近使用）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // LRU 淘汰：删除最久未使用的（Map 的第一个）
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  /** 失效指定项目的所有缓存条目 */
  invalidateProject(projectId: string): void {
    const prefix = `${projectId}:`;
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/** 模块级单例 */
export const promptCache = new LRUPromptCache(100);

// ===== 知识版本追踪（内存 Map，与缓存同生命周期）=====

const knowledgeVersions = new Map<string, number>();

/** 获取项目的知识版本号（默认 0） */
export function getKnowledgeVersion(projectId: string): number {
  return knowledgeVersions.get(projectId) ?? 0;
}

/** 递增项目的知识版本号，返回新版本号 */
export function incrementKnowledgeVersion(projectId: string): number {
  const next = (knowledgeVersions.get(projectId) ?? 0) + 1;
  knowledgeVersions.set(projectId, next);
  return next;
}

/**
 * 构建缓存 key
 * dateStr 仅取日期部分（不含时分秒），确保同一天内缓存命中
 * P2-2: retrievalHash 为 queryText 的 FNV-1a hash，区分不同语义检索结果
 */
export function buildCacheKey(
  projectId: string,
  expertId: string,
  knowledgeVersion: number,
  requireHook: boolean,
  phase: string,
  dateStr: string,
  retrievalHash: string = ""
): string {
  return `${projectId}:${expertId}:${knowledgeVersion}:${requireHook ? 1 : 0}:${phase}:${dateStr}:${retrievalHash}`;
}
