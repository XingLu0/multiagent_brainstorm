"use client";

import React from "react";
import { calculateWordFrequency } from "@/lib/visualization";

interface WordCloudProps {
  messages: Array<{ content: string }>;
}

export default function WordCloud({ messages }: WordCloudProps) {
  const words = calculateWordFrequency(messages, { maxWords: 40 });

  if (words.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">暂无讨论数据</div>;
  }

  const maxCount = words[0].count;
  const minCount = words[words.length - 1].count;
  const range = maxCount - minCount || 1;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-4">
      {words.map((w, i) => {
        const ratio = (w.count - minCount) / range;
        const fontSize = 14 + ratio * 24; // 14px - 38px
        const opacity = 0.5 + ratio * 0.5;
        return (
          <span
            key={i}
            className="cursor-default rounded px-1 transition-transform hover:scale-110"
            style={{
              fontSize: `${fontSize}px`,
              opacity,
              color: `hsl(${210 + ratio * 30}, 70%, ${40 + ratio * 20}%)`,
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
}
