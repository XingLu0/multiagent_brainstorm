"use client";

import React, { useMemo } from "react";
import { buildControversyMatrix, calculateWordFrequency, type VizMessage, type VizExpert } from "@/lib/visualization";

interface ControversyMatrixProps {
  messages: VizMessage[];
  experts: VizExpert[];
}

const POSITION_STYLES: Record<string, string> = {
  support: "bg-green-100 text-green-700",
  oppose: "bg-red-100 text-red-700",
  neutral: "bg-gray-100 text-gray-600",
  unknown: "bg-gray-50 text-gray-400",
};

const POSITION_LABELS: Record<string, string> = {
  support: "支持",
  oppose: "反对",
  neutral: "中立",
  unknown: "—",
};

export default function ControversyMatrix({ messages, experts }: ControversyMatrixProps) {
  // 从消息中提取 top-5 话题
  const topics = useMemo(() => {
    const words = calculateWordFrequency(messages, { maxWords: 5 });
    return words.map((w) => w.word);
  }, [messages]);

  const matrix = useMemo(() => buildControversyMatrix(messages, experts, topics), [messages, experts, topics]);

  if (topics.length === 0 || matrix.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">暂无讨论数据</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-gray-600">专家</th>
            {topics.map((t) => (
              <th key={t} className="px-3 py-2 text-center text-gray-600">{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.expertId}>
              <td className="px-3 py-2 font-medium text-gray-700">{row.expertName}</td>
              {topics.map((t) => (
                <td key={t} className="px-3 py-2 text-center">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs ${POSITION_STYLES[row.positions[t] ?? "unknown"]}`}>
                    {POSITION_LABELS[row.positions[t] ?? "unknown"]}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
