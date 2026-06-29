"use client";

import React, { useState } from "react";
import { fetchWithConfig } from "@/lib/client-config";

interface ExpertRecommendationProps {
  title: string;
  onRecommend: (expertIds: string[], reasoning: string) => void;
}

/**
 * P2-4: 智能推荐专家组合
 *
 * 根据项目标题调用 LLM 推荐最适合的专家组合，
 * 展示推荐理由并填充到父组件的专家选择中。
 */
export function ExpertRecommendation({ title, onRecommend }: ExpertRecommendationProps) {
  const [loading, setLoading] = useState(false);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRecommend = async () => {
    if (!title.trim()) {
      setError("请先输入项目标题");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithConfig("/api/v1/experts/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!res.ok) throw new Error("推荐失败");
      const data = await res.json();
      onRecommend(data.expertIds, data.reasoning);
      setReasoning(data.reasoning);
    } catch {
      setError("推荐失败，请检查 API 配置后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-blue-900">智能推荐专家组合</span>
          <span className="text-xs text-blue-600">AI 根据标题推荐</span>
        </div>
        <button
          type="button"
          onClick={handleRecommend}
          disabled={loading || title.trim().length === 0}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "推荐中..." : "智能推荐"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
      {reasoning && (
        <p className="mt-2 text-xs text-blue-800">
          <span className="font-medium">推荐理由：</span>{reasoning}
        </p>
      )}
    </div>
  );
}
