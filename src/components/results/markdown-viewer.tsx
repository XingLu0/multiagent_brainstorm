"use client";

import React, { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewerProps {
  content: string;
  /** Optional label for the copy button, defaults to "复制" */
  copyLabel?: string;
}

/**
 * Renders markdown content using react-markdown + remark-gfm.
 * Includes a copy button to copy raw markdown.
 */
export function MarkdownViewer({ content, copyLabel = "复制" }: MarkdownViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API might not be available
    }
  }, [content]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
      >
        {copied ? "已复制" : copyLabel}
      </button>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4">
        <div className="prose-sm max-w-none text-gray-800">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="mb-3 mt-4 text-xl font-bold first:mt-0">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-2 mt-4 text-lg font-bold first:mt-0">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h3>
              ),
              h4: ({ children }) => (
                <h4 className="mb-1 mt-2 text-sm font-semibold">{children}</h4>
              ),
              p: ({ children }) => (
                <p className="mb-3 leading-relaxed last:mb-0">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
              ),
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              strong: ({ children }) => <strong className="font-bold">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              code: ({ children }) => (
                <code className="rounded bg-gray-100 px-1 py-0.5 text-sm font-mono text-gray-800">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="mb-3 overflow-x-auto rounded-lg bg-gray-900 p-3 text-sm text-gray-100 last:mb-0">
                  {children}
                </pre>
              ),
              blockquote: ({ children }) => (
                <blockquote className="mb-3 border-l-4 border-gray-300 pl-3 italic text-gray-600 last:mb-0">
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="mb-3 overflow-x-auto last:mb-0">
                  <table className="w-full border-collapse border border-gray-300 text-sm">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
              th: ({ children }) => (
                <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-gray-300 px-2 py-1">{children}</td>
              ),
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  {children}
                </a>
              ),
              hr: () => <hr className="my-4 border-gray-200" />,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default MarkdownViewer;
