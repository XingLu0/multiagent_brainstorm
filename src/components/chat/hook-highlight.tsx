"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const HOOK_REGEX = /\[HOOK\]\s*([\s\S]+)/;

interface HookHighlightProps {
  content: string;
}

/**
 * Markdown component styles adapted for chat message bubbles.
 * Smaller text size, tighter spacing than the full-page MarkdownViewer.
 */
const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-2 mt-2 text-base font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-2 text-sm font-bold first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mb-1 mt-1 text-sm font-semibold">{children}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-gray-100 px-1 py-0.5 text-xs font-mono text-gray-800">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-gray-900 p-2 text-xs text-gray-100 last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="mb-2 border-l-2 border-gray-300 pl-2 italic text-gray-600 last:mb-0">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse border border-gray-300 text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-gray-50">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-gray-300 px-1.5 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-gray-300 px-1.5 py-1">{children}</td>
  ),
  a: ({
    children,
    href,
  }: {
    children?: React.ReactNode;
    href?: string;
  }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-800"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-gray-200" />,
};

/**
 * Parses content for [HOOK] pattern and renders the hook question
 * as a bold block with light blue background. Renders markdown in
 * both the main content and the hook question.
 */
export function HookHighlight({ content }: HookHighlightProps) {
  const match = content.match(HOOK_REGEX);

  if (!match) {
    return (
      <div className="text-sm leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  const hookIndex = match.index ?? 0;
  const beforeHook = content.slice(0, hookIndex);
  const hookQuestion = match[1];

  return (
    <div className="space-y-2">
      {beforeHook.trim() && (
        <div className="text-sm leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {beforeHook.trim()}
          </ReactMarkdown>
        </div>
      )}
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 font-bold text-blue-900">
        {hookQuestion.trim()}
      </div>
    </div>
  );
}

export default HookHighlight;
