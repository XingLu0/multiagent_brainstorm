"use client";

import React from "react";
import { buildTimelineData, type VizMessage } from "@/lib/visualization";

interface TimelineProps {
  messages: VizMessage[];
}

const ROLE_COLORS: Record<string, string> = {
  user: "bg-blue-500",
  host: "bg-purple-500",
  summary: "bg-green-500",
  pause: "bg-yellow-500",
  system: "bg-gray-500",
};

const ROLE_LABELS: Record<string, string> = {
  user: "用户",
  host: "主持人",
  summary: "总结",
  pause: "暂停",
  system: "系统",
};

export default function Timeline({ messages }: TimelineProps) {
  const nodes = buildTimelineData(messages);

  if (nodes.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">暂无讨论数据</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-start gap-2 pb-4">
        {nodes.map((node, i) => (
          <div key={i} className="flex flex-col items-center" style={{ minWidth: "120px" }}>
            <div className={`mb-1 rounded-full px-2 py-0.5 text-xs text-white ${ROLE_COLORS[node.role] ?? "bg-gray-400"}`}>
              {ROLE_LABELS[node.role] ?? node.role}
            </div>
            <div className={`w-0.5 h-4 ${ROLE_COLORS[node.role] ?? "bg-gray-400"}`} />
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600" style={{ maxWidth: "120px" }}>
              <div className="mb-1 font-medium text-gray-700">第 {node.round} 轮</div>
              <div className="line-clamp-3">{node.preview}</div>
            </div>
            {i < nodes.length - 1 && (
              <div className="mt-2 text-gray-300">→</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
