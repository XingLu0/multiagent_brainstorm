"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Transformer } from "markmap-lib";
import type { Markmap } from "markmap-view";
import { parseSSEStream } from "@/lib/sse";
import { fetchWithConfig } from "@/lib/client-config";

interface MindmapViewProps {
  projectId: string;
  minutesContent: string;
}

export function MindmapView({ projectId, minutesContent }: MindmapViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<Markmap | null>(null);
  const transformerRef = useRef<Transformer | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当 markdown 变化时重新渲染思维导图
  useEffect(() => {
    if (!svgRef.current || !markdown) return;

    (async () => {
      // 动态加载 markmap 库（首次调用时）
      if (!transformerRef.current) {
        try {
          const { Transformer: TransformerClass } = await import("markmap-lib");
          transformerRef.current = new TransformerClass();
        } catch {
          setError("思维导图组件加载失败");
          return;
        }
      }

      const { root } = transformerRef.current.transform(markdown);
      if (!markmapRef.current) {
        const { Markmap: MarkmapClass } = await import("markmap-view");
        markmapRef.current = MarkmapClass.create(svgRef.current);
      }
      markmapRef.current.setData(root);
      markmapRef.current.fit();
    })();
  }, [markdown]);

  // 清理
  useEffect(() => {
    return () => {
      markmapRef.current?.destroy();
      markmapRef.current = null;
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setMarkdown("");

    try {
      const res = await fetchWithConfig(`/api/v1/sessions/${projectId}/mindmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("生成失败");

      let fullContent = "";
      await parseSSEStream(res, {
        onMindmap: (data) => {
          fullContent += data.content;
          setMarkdown(fullContent);
        },
        onError: (data) => {
          setError(data.message);
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  }, [projectId]);

  const handleExportSVG = useCallback(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mindmap.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportPNG = useCallback(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svg.clientWidth * 2;
      canvas.height = svg.clientHeight * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = "mindmap.png";
        a.click();
        URL.revokeObjectURL(pngUrl);
      });
    };
    img.src = url;
  }, []);

  if (!minutesContent) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">请先生成会议纪要</p>
        <p className="mt-1 text-xs text-gray-400">思维导图基于会议纪要生成</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? "生成中..." : "生成思维导图"}
        </button>
        {markdown && !isGenerating && (
          <>
            <button onClick={handleExportSVG} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
              导出 SVG
            </button>
            <button onClick={handleExportPNG} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
              导出 PNG
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {(markdown || isGenerating) && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <svg
            ref={svgRef}
            className="w-full"
            style={{ height: "500px", minHeight: "400px" }}
          />
        </div>
      )}

      {isGenerating && !markdown && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500" />
        </div>
      )}
    </div>
  );
}

export default MindmapView;
