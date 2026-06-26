"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useExperts } from "@/lib/hooks/use-experts";
import { getExpertColors } from "@/lib/experts/colors";
import { ALLOWED_COLORS, isHexColor, type ExpertDefinition } from "@/lib/experts/types";

const COLOR_LABELS: Record<string, string> = {
  emerald: "翠绿",
  orange: "橙色",
  violet: "紫色",
  pink: "粉色",
  teal: "青色",
};

/**
 * Global expert management page.
 * List all experts (builtin + custom), create/edit/delete custom experts.
 */
export default function ExpertsPage() {
  const { experts, loading, refresh } = useExperts();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpertDefinition | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [focus, setFocus] = useState("");
  const [avatarColor, setAvatarColor] = useState("emerald");

  const resetForm = () => {
    setName("");
    setPersona("");
    setFocus("");
    setAvatarColor("emerald");
  };

  const startCreate = () => {
    setEditTarget(null);
    resetForm();
    setShowForm(true);
  };

  const startEdit = (expert: ExpertDefinition) => {
    setEditTarget(expert);
    setName(expert.name);
    setPersona(expert.persona);
    setFocus(expert.focus);
    setAvatarColor(expert.avatarColor);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditTarget(null);
    resetForm();
  };

  const handleSave = async () => {
    if (!name.trim() || !persona.trim()) return;
    setSaving(true);
    try {
      const url = editTarget
        ? `/api/experts/${editTarget.id}`
        : "/api/experts";
      const method = editTarget ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          persona: persona.trim(),
          focus: focus.trim(),
          avatarColor,
        }),
      });
      if (res.ok) {
        await refresh();
        cancelForm();
      }
    } catch {
      // Error
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除角色「${name}」？`)) return;
    try {
      const res = await fetch(`/api/experts/${id}`, { method: "DELETE" });
      if (res.ok) {
        await refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "删除失败");
      }
    } catch {
      // Error
    }
  };

  return (
    <main className="min-h-full flex-1 bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">专家管理</h1>
            <p className="mt-1 text-sm text-gray-500">
              管理内置和自定义专家角色
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              返回首页
            </Link>
            {!showForm && (
              <button
                type="button"
                onClick={startCreate}
                className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                新建角色
              </button>
            )}
          </div>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="mb-6 rounded-xl border-2 border-gray-300 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">
              {editTarget ? "编辑角色" : "创建自定义角色"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如：数据分析师"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  人设 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  placeholder="描述该专家的性格、专长、分析风格..."
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  关注领域
                </label>
                <input
                  type="text"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="如：数据分析、可视化、统计建模"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  配色
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {ALLOWED_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAvatarColor(color)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                        avatarColor === color
                          ? "border-gray-400 bg-gray-50"
                          : "border-gray-200"
                      }`}
                    >
                      <span
                        className={`h-4 w-4 rounded-full ${getExpertColors(color).avatar}`}
                      />
                      {COLOR_LABELS[color]}
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={isHexColor(avatarColor) ? avatarColor : "#10b981"}
                      onChange={(e) => setAvatarColor(e.target.value)}
                      className="h-7 w-7 cursor-pointer rounded-full border border-gray-300 p-0"
                      title="自定义颜色"
                    />
                    <input
                      type="text"
                      value={isHexColor(avatarColor) ? avatarColor : ""}
                      onChange={(e) => setAvatarColor(e.target.value)}
                      placeholder="#ffffff"
                      className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelForm}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !name.trim() || !persona.trim()}
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  {saving ? "保存中..." : editTarget ? "保存" : "创建"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expert List */}
        {loading ? (
          <div className="py-12 text-center text-gray-400">加载中...</div>
        ) : (
          <div className="space-y-3">
            {experts.map((expert) => {
              const colors = getExpertColors(expert.avatarColor);
              const isCustom = !expert.isBuiltin;
              return (
                <div
                  key={expert.id}
                  className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4"
                  style={colors.style}
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${colors.avatar} text-lg font-semibold text-white`}
                  >
                    {expert.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{expert.name}</h3>
                      {expert.isBuiltin ? (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          内置
                        </span>
                      ) : (
                        <span className={`rounded px-2 py-0.5 text-xs ${colors.badge}`}>
                          自定义
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{expert.persona}</p>
                    {expert.focus && (
                      <p className="mt-1 text-xs text-gray-400">关注：{expert.focus}</p>
                    )}
                  </div>
                  {isCustom && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(expert)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        aria-label="编辑"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(expert.id, expert.name)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label="删除"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
