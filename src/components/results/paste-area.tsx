"use client";

import React, { useState } from "react";

interface PasteAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (docType: "prd" | "spec") => void;
  isGenerating: boolean;
}

const MIN_CONTENT_LENGTH = 50;

/**
 * Textarea for pasting content with PRD/SPEC generation buttons.
 * Validates that content is >= 50 chars on submit attempt.
 */
export function PasteArea({ value, onChange, onSubmit, isGenerating }: PasteAreaProps) {
  const [showError, setShowError] = useState(false);

  const handleSubmit = (docType: "prd" | "spec") => {
    if (value.trim().length < MIN_CONTENT_LENGTH) {
      setShowError(true);
      return;
    }
    setShowError(false);
    onSubmit(docType);
  };

  const isTooShort = value.trim().length < MIN_CONTENT_LENGTH;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          粘贴修改后的会议纪要
        </label>
        <textarea
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (showError && e.target.value.trim().length >= MIN_CONTENT_LENGTH) {
              setShowError(false);
            }
          }}
          placeholder="在此粘贴修改后的会议纪要内容（至少50个字符）..."
          rows={8}
          className={`w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-1 ${
            showError
              ? "border-red-500 focus:border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          }`}
        />
        {showError ? (
          <p className="mt-1 text-xs text-red-500">
            内容至少需要 {MIN_CONTENT_LENGTH} 个字符（当前 {value.trim().length} 个字符）
          </p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">
            {value.trim().length} / {MIN_CONTENT_LENGTH} 字符
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleSubmit("prd")}
          disabled={isGenerating}
          className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? "文档生成中..." : "生成PRD草稿"}
        </button>
        <button
          type="button"
          onClick={() => handleSubmit("spec")}
          disabled={isGenerating}
          className="flex-1 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? "文档生成中..." : "生成SPEC草稿"}
        </button>
      </div>
    </div>
  );
}

export default PasteArea;
