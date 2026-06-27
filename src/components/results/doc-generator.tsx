"use client";

import React, { useState, useCallback, useRef } from "react";
import { PasteArea } from "./paste-area";
import { MarkdownViewer } from "./markdown-viewer";
import { parseSSEStream } from "@/lib/sse";
import { fetchWithConfig } from "@/lib/client-config";
import type { DocumentType } from "@/lib/engine/doc-types";
import { DOC_TYPE_LABELS } from "@/lib/engine/doc-types";

interface DocGeneratorProps {
  projectId: string;
  /** Optional initial content to pre-fill the paste area */
  initialContent?: string;
}

/**
 * Client component that handles document generation via SSE.
 * Uses paste-area for input, displays generated document with markdown-viewer.
 * Supports aborting generation via AbortController.
 */
export function DocGenerator({ projectId, initialContent = "" }: DocGeneratorProps) {
  const [content, setContent] = useState(initialContent);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState("");
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Toast auto-dismiss
  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleGenerate = useCallback(
    async (type: DocumentType) => {
      setIsGenerating(true);
      setError(null);
      setGeneratedDoc("");
      setDocType(type);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetchWithConfig(`/api/sessions/${projectId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, content }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error ?? `请求失败 (${response.status})`);
        }

        let doc = "";
        await parseSSEStream(response, {
          onDocument: (data) => {
            doc += data.content;
            setGeneratedDoc(doc);
          },
          onError: (data) => {
            setError(data.message);
            setToast(`生成失败: ${data.message}`);
          },
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // User cancelled - not an error
        } else {
          const msg = e instanceof Error ? e.message : "文档生成失败";
          setError(msg);
          setToast(`生成失败: ${msg}`);
        }
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    [projectId, content]
  );

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsGenerating(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <PasteArea
        value={content}
        onChange={setContent}
        onSubmit={handleGenerate}
        isGenerating={isGenerating}
      />

      {/* Stop button */}
      {isGenerating && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleStop}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            停止生成
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">生成失败</p>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (docType) handleGenerate(docType);
            }}
            className="mt-2 rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
          >
            重试
          </button>
        </div>
      )}

      {isGenerating && !generatedDoc && (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 py-12">
          <div className="flex items-center gap-2 text-gray-500">
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]"></span>
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]"></span>
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></span>
            </div>
            <span className="text-sm">
              {docType ? `正在生成${DOC_TYPE_LABELS[docType]}文档...` : "正在生成文档..."}
            </span>
          </div>
        </div>
      )}

      {generatedDoc && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            {docType ? DOC_TYPE_LABELS[docType] : "文档草稿"}
          </h3>
          <MarkdownViewer content={generatedDoc} copyLabel="复制文档" />
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transform">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
            <p className="text-sm text-gray-700">{toast}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-gray-400 transition-colors hover:text-gray-600"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocGenerator;
