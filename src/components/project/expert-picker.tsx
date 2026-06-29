"use client";

import React, { useState } from "react";
import { useExperts } from "@/lib/hooks/use-experts";
import { getExpertColors } from "@/lib/experts/colors";
import { ALLOWED_COLORS, isHexColor, type ExpertDefinition } from "@/lib/experts/types";

interface ExpertPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const COLOR_LABELS: Record<string, string> = {
  emerald: "翠绿",
  orange: "橙色",
  violet: "紫色",
  pink: "粉色",
  teal: "青色",
};

/**
 * Grid of expert cards, clickable to toggle selection.
 * Supports creating custom roles inline.
 * Custom (non-builtin) experts can be edited/deleted.
 */
export function ExpertPicker({ selectedIds, onChange }: ExpertPickerProps) {
  const { experts, loading, refresh } = useExperts();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpertDefinition | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [focus, setFocus] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>("emerald");

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const resetForm = () => {
    setName("");
    setPersona("");
    setFocus("");
    setAvatarColor("emerald");
  };

  const handleCreate = async () => {
    if (!name.trim() || !persona.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/experts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          persona: persona.trim(),
          focus: focus.trim(),
          avatarColor,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        await refresh();
        onChange([...selectedIds, created.id]);
        setShowCreateForm(false);
        resetForm();
      }
    } catch {
      // Error - could show toast
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!name.trim() || !persona.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/v1/experts/${id}`, {
        method: "PUT",
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
        setEditTarget(null);
        resetForm();
      }
    } catch {
      // Error
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/experts/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await refresh();
        onChange(selectedIds.filter((i) => i !== id));
      }
    } catch {
      // Error
    }
  };

  const startEdit = (expert: ExpertDefinition) => {
    setEditTarget(expert);
    setName(expert.name);
    setPersona(expert.persona);
    setFocus(expert.focus);
    setAvatarColor(expert.avatarColor);
    setShowCreateForm(false);
  };

  const cancelForm = () => {
    setShowCreateForm(false);
    setEditTarget(null);
    resetForm();
  };

  // Edit form for existing custom expert
  if (editTarget) {
    const colors = getExpertColors(avatarColor);
    return (
      <div className="rounded-xl border-2 border-gray-300 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-700">编辑角色</h4>
        <ExpertForm
          name={name}
          persona={persona}
          focus={focus}
          avatarColor={avatarColor}
          onName={setName}
          onPersona={setPersona}
          onFocus={setFocus}
          onColor={setAvatarColor}
          colors={colors}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelForm}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => handleUpdate(editTarget.id)}
            disabled={creating || !name.trim() || !persona.trim()}
            className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {creating ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    );
  }

  // Create form
  if (showCreateForm) {
    const colors = getExpertColors(avatarColor);
    return (
      <div className="rounded-xl border-2 border-gray-300 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-700">创建自定义角色</h4>
        <ExpertForm
          name={name}
          persona={persona}
          focus={focus}
          avatarColor={avatarColor}
          onName={setName}
          onPersona={setPersona}
          onFocus={setFocus}
          onColor={setAvatarColor}
          colors={colors}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelForm}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !name.trim() || !persona.trim()}
            className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {creating ? "创建中..." : "创建并选中"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {experts.map((expert) => {
        const selected = selectedIds.includes(expert.id);
        const colors = getExpertColors(expert.avatarColor);

        return (
          <div
            key={expert.id}
            className={`group relative flex items-start gap-3 rounded-xl border-2 p-4 transition-all ${
              selected
                ? `${colors.border} ${colors.bg} ring-2 ${colors.ring}`
                : "border-gray-200 hover:border-gray-300"
            }`}
            style={colors.style}
          >
            <button
              type="button"
              onClick={() => toggle(expert.id)}
              className="flex flex-1 items-start gap-3 text-left"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${colors.avatar} text-base font-semibold text-white`}
              >
                {expert.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{expert.name}</span>
                  {selected && (
                    <svg
                      className={`h-4 w-4 ${colors.badge.split(" ")[1]}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">{expert.focus}</p>
              </div>
            </button>

            {/* Edit/Delete for custom experts */}
            {!expert.isBuiltin && (
              <div className="absolute right-2 top-2 flex gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(expert);
                  }}
                  className="rounded p-1 text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
                  aria-label="编辑角色"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除角色「${expert.name}」？`)) {
                      handleDelete(expert.id);
                    }
                  }}
                  className="rounded p-1 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  aria-label="删除角色"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5"
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

      {/* Create custom expert card */}
      <button
        type="button"
        onClick={() => setShowCreateForm(true)}
        className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-4 text-gray-500 transition-all hover:border-blue-400 hover:text-blue-500"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-sm font-medium">创建自定义角色</span>
      </button>
    </div>
  );
}

/**
 * Shared form fields for create/edit expert
 */
function ExpertForm({
  name,
  persona,
  focus,
  avatarColor,
  onName,
  onPersona,
  onFocus,
  onColor,
  colors,
}: {
  name: string;
  persona: string;
  focus: string;
  avatarColor: string;
  onName: (v: string) => void;
  onPersona: (v: string) => void;
  onFocus: (v: string) => void;
  onColor: (v: string) => void;
  colors: ReturnType<typeof getExpertColors>;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">名称 *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="如：数据分析师"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">人设 *</label>
        <textarea
          value={persona}
          onChange={(e) => onPersona(e.target.value)}
          placeholder="描述该专家的性格、专长、分析风格..."
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">关注领域</label>
        <input
          type="text"
          value={focus}
          onChange={(e) => onFocus(e.target.value)}
          placeholder="如：数据分析、可视化、统计建模"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">配色</label>
        <div className="flex flex-wrap items-center gap-2">
          {ALLOWED_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onColor(color)}
              className={`h-7 w-7 rounded-full ${getExpertColors(color).avatar} transition-all ${
                avatarColor === color ? "ring-2 ring-offset-2 ring-gray-400" : ""
              }`}
              title={COLOR_LABELS[color]}
            />
          ))}
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={isHexColor(avatarColor) ? avatarColor : "#10b981"}
              onChange={(e) => onColor(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded-full border border-gray-300 p-0"
              title="自定义颜色"
            />
            <input
              type="text"
              value={isHexColor(avatarColor) ? avatarColor : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (isHexColor(v)) onColor(v);
                else onColor(v);
              }}
              placeholder="#ffffff"
              className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExpertPicker;
