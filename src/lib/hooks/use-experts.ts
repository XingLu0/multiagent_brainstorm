"use client";

import { useState, useEffect, useCallback } from "react";
import { EXPERTS, type ExpertDefinition } from "@/lib/experts/types";

// 模块级缓存：多组件共享同一次请求
let cache: ExpertDefinition[] | null = null;
let inflight: Promise<ExpertDefinition[]> | null = null;

/**
 * 客户端 Hook：获取专家列表（内置 + 自定义）
 * - 模块级 cache + inflight 去重，多组件共享一次请求
 * - 加载期回退内存 EXPERTS 保证首屏不空
 * - 提供 refresh() 供创建/编辑/删除后刷新缓存
 */
export function useExperts() {
  const [experts, setExperts] = useState<ExpertDefinition[]>(cache ?? EXPERTS);
  const [loading, setLoading] = useState(!cache);

  const refresh = useCallback(async () => {
    inflight = null;
    setLoading(true);
    try {
      const res = await fetch("/api/experts");
      if (res.ok) {
        const data = (await res.json()) as ExpertDefinition[];
        cache = data;
        setExperts(data);
      } else {
        cache = EXPERTS;
        setExperts(EXPERTS);
      }
    } catch {
      cache = EXPERTS;
      setExperts(EXPERTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cache) {
      setExperts(cache);
      return;
    }
    let active = true;
    if (!inflight) {
      inflight = (async () => {
        try {
          const res = await fetch("/api/experts");
          if (res.ok) {
            cache = (await res.json()) as ExpertDefinition[];
            return cache;
          }
        } catch {
          // 网络错误时回退到内存
        }
        cache = EXPERTS;
        return EXPERTS;
      })();
    }
    const pending = inflight;
    if (pending) {
      pending.then((d) => {
        if (active) {
          setExperts(d);
          setLoading(false);
        }
      });
    }
    return () => {
      active = false;
    };
  }, []);

  return { experts, loading, refresh };
}

/**
 * 同步从缓存中获取专家（用于不需要响应式更新的热路径）
 */
export function getExpertFromCache(
  id: string
): ExpertDefinition | undefined {
  return (cache ?? EXPERTS).find((e) => e.id === id);
}
