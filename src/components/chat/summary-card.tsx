"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SummaryCardProps {
  content: string;
  label?: string;
}

/**
 * Special card with distinct amber background for stage summaries.
 * Renders markdown content.
 */
export function SummaryCard({ content, label = "阶段总结" }: SummaryCardProps) {
  return (
    <div className="mx-auto my-4 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
          {label}
        </span>
      </div>
      <div className="text-sm leading-relaxed text-amber-900">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="mb-2 text-base font-bold">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-2 text-sm font-bold">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold">{children}</h3>,
            p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
            ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            strong: ({ children }) => <strong className="font-bold">{children}</strong>,
            code: ({ children }) => (
              <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono">{children}</code>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-amber-300 pl-3 italic">{children}</blockquote>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default SummaryCard;
