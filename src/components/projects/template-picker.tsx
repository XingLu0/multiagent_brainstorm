"use client";

import { useState, useEffect } from "react";

interface Template {
  id: string;
  name: string;
  description: string;
  title: string;
  expertIds: string;
  isBuiltin: boolean;
}

interface TemplatePickerProps {
  onSelect: (data: { title: string; expertIds: string[] }) => void;
}

export function TemplatePicker({ onSelect }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/templates")
      .then((res) => res.json())
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSelect = (template: Template | null) => {
    if (template === null) {
      setSelectedId(null);
      onSelect({ title: "", expertIds: [] });
    } else {
      setSelectedId(template.id);
      onSelect({
        title: template.title,
        expertIds: JSON.parse(template.expertIds),
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        从模板开始（可选）
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* 空白模板 */}
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className={`rounded-lg border p-3 text-left transition-colors ${
            selectedId === null
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <div className="text-sm font-medium text-gray-700">空白模板</div>
          <div className="mt-1 text-xs text-gray-400">自由配置</div>
        </button>

        {/* 内置 + 自定义模板 */}
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => handleSelect(tpl)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              selectedId === tpl.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-gray-700">{tpl.name}</span>
              {tpl.isBuiltin && (
                <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">
                  内置
                </span>
              )}
            </div>
            <div className="mt-1 line-clamp-2 text-xs text-gray-400">
              {tpl.description}
            </div>
            <div className="mt-1 text-[10px] text-gray-400">
              {JSON.parse(tpl.expertIds).length} 位专家
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
