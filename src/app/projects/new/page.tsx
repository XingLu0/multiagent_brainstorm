"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExpertPicker } from "@/components/project/expert-picker";
import { TemplatePicker } from "@/components/projects/template-picker";
import { ExpertRecommendation } from "@/components/projects/expert-recommendation";

const MAX_TITLE_LENGTH = 200;

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("请输入项目标题");
      return;
    }
    if (selectedIds.length < 2) {
      setError("请至少选择 2 位专家");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          expertIds: selectedIds,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? "创建项目失败");
      }

      const data = await res.json();
      router.push(`/projects/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建项目失败");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-full flex-1 bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          返回项目列表
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-gray-900">新建脑暴</h1>
        <p className="mb-6 text-sm text-gray-500">
          选择专家团队，开始一场多视角的 AI 脑暴协作
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template picker */}
          <TemplatePicker
            onSelect={({ title: tplTitle, expertIds }) => {
              if (tplTitle) setTitle(tplTitle);
              if (expertIds.length > 0) setSelectedIds(expertIds);
            }}
          />

          {/* Title input */}
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-gray-700">
              项目标题
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE_LENGTH))}
              placeholder="例如：如何设计一个用户增长策略..."
              maxLength={MAX_TITLE_LENGTH}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              {title.length} / {MAX_TITLE_LENGTH}
            </p>
          </div>

          {/* Expert picker */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                选择专家团队
              </label>
              <span className="text-xs text-gray-400">
                已选择 {selectedIds.length} 位（至少 2 位）
              </span>
            </div>
            {title.trim().length > 3 && (
              <div className="mb-3">
                <ExpertRecommendation
                  title={title}
                  onRecommend={(ids) => setSelectedIds(ids)}
                />
              </div>
            )}
            <ExpertPicker selectedIds={selectedIds} onChange={setSelectedIds} />
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit button */}
          <div className="flex justify-end gap-2">
            <Link
              href="/"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "创建中..." : "开始脑暴"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
