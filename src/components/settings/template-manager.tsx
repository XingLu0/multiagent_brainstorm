"use client";

import React, { useState, useEffect, useCallback } from "react";

interface Template {
  id: string;
  name: string;
  description: string;
  title: string;
  expertIds: string;
  phase: string;
  isBuiltin: boolean;
  createdAt: string;
}

interface Expert {
  id: string;
  name: string;
  avatarColor: string;
  isBuiltin: boolean;
}

interface TemplateFormData {
  name: string;
  description: string;
  title: string;
  expertIds: string[];
  phase: string;
}

const EMPTY_FORM: TemplateFormData = {
  name: "",
  description: "",
  title: "",
  expertIds: [],
  phase: "diverge",
};

export default function TemplateManager({ onChanged }: { onChanged?: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(EMPTY_FORM);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      const [tplRes, expRes] = await Promise.all([
        fetch("/api/v1/templates"),
        fetch("/api/v1/experts"),
      ]);
      const tplData = await tplRes.json();
      const expData = await expRes.json();
      setTemplates(Array.isArray(tplData) ? tplData : []);
      setExperts(Array.isArray(expData) ? expData.filter((e: Expert) => e.isBuiltin) : []);
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tplRes, expRes] = await Promise.all([
          fetch("/api/v1/templates"),
          fetch("/api/v1/experts"),
        ]);
        const tplData = await tplRes.json();
        const expData = await expRes.json();
        if (cancelled) return;
        setTemplates(Array.isArray(tplData) ? tplData : []);
        setExperts(Array.isArray(expData) ? expData.filter((e: Expert) => e.isBuiltin) : []);
      } catch {
        if (!cancelled) setError("加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
    setError(null);
  };

  const handleEdit = (tpl: Template) => {
    setEditingId(tpl.id);
    setFormData({
      name: tpl.name,
      description: tpl.description,
      title: tpl.title,
      expertIds: JSON.parse(tpl.expertIds),
      phase: tpl.phase,
    });
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此模板？")) return;
    try {
      const res = await fetch(`/api/v1/templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "删除失败");
        return;
      }
      showToast("模板已删除");
      onChanged?.();
      await loadData();
    } catch {
      setError("删除失败");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("模板名称不能为空");
      return;
    }
    if (formData.expertIds.length < 2) {
      setError("至少需要选择 2 位专家");
      return;
    }

    try {
      const payload = { ...formData, expertIds: formData.expertIds };
      const url = editingId
        ? `/api/v1/templates/${editingId}`
        : "/api/v1/templates";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "保存失败");
        return;
      }

      showToast(editingId ? "模板已更新" : "模板已创建");
      onChanged?.();
      setShowForm(false);
      setFormData(EMPTY_FORM);
      setEditingId(null);
      await loadData();
    } catch {
      setError("保存失败");
    }
  };

  const toggleExpert = (expertId: string) => {
    setFormData((prev) => ({
      ...prev,
      expertIds: prev.expertIds.includes(expertId)
        ? prev.expertIds.filter((id) => id !== expertId)
        : [...prev.expertIds, expertId],
    }));
  };

  if (loading) {
    return <p className="text-sm text-gray-400">加载中...</p>;
  }

  return (
    <div>
      {/* Template list */}
      <div className="space-y-3">
        {templates.map((tpl) => {
          const tplExperts = JSON.parse(tpl.expertIds) as string[];
          const expertNames = tplExperts
            .map((id) => experts.find((e) => e.id === id)?.name || id)
            .join("、");
          return (
            <div
              key={tpl.id}
              className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-medium text-gray-900">{tpl.name}</span>
                  {tpl.isBuiltin ? (
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                      内置
                    </span>
                  ) : (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      自定义
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{tpl.description}</p>
                <p className="mt-1 text-xs text-gray-400">
                  讨论标题：{tpl.title} | 专家：{expertNames}
                </p>
              </div>
              {!tpl.isBuiltin && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(tpl)}
                    className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(tpl.id)}
                    className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 transition-colors hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create button */}
      {!showForm && (
        <button
          type="button"
          onClick={handleCreate}
          className="mt-4 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
        >
          + 新建模板
        </button>
      )}

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
        >
          <h3 className="text-sm font-semibold text-gray-700">
            {editingId ? "编辑模板" : "新建模板"}
          </h3>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              模板名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="如：用户增长策略"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              模板描述
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="简短描述模板用途"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              讨论标题
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="使用此模板时的默认讨论标题"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              参与专家 <span className="text-red-500">*</span>
              <span className="ml-1 text-xs text-gray-400">（至少选 2 位）</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {experts.map((expert) => {
                const selected = formData.expertIds.includes(expert.id);
                return (
                  <button
                    key={expert.id}
                    type="button"
                    onClick={() => toggleExpert(expert.id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      selected
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {expert.name}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormData(EMPTY_FORM);
                setEditingId(null);
                setError(null);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              {editingId ? "保存" : "创建"}
            </button>
          </div>
        </form>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transform">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
            <p className="text-sm text-gray-700">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}
