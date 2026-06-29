"use client";

import React from "react";
import { useExperts } from "@/lib/hooks/use-experts";
import { getExpertColors } from "@/lib/experts/colors";

interface TypingIndicatorProps {
  typingRole?: { role: "host" | "expert" | "summary" | "pause"; expertId?: string; round?: number };
  searchStatus?: string | null;
}

/**
 * Animated typing indicator showing which role is currently thinking.
 * Expert dots are colored to match the expert's avatarColor.
 * When searchStatus is set, shows the search query with a search icon animation.
 */
export function TypingIndicator({ typingRole, searchStatus }: TypingIndicatorProps) {
  const { experts } = useExperts();
  const role = typingRole?.role ?? "host";
  const expertId = typingRole?.expertId;
  const round = typingRole?.round;

  let text: string;
  let dotColor: string;
  let dotStyle: React.CSSProperties | undefined;

  if (role === "host") {
    text = "主持人正在引导讨论...";
    dotColor = "bg-gray-400";
  } else if (role === "summary") {
    text = "正在生成阶段总结...";
    dotColor = "bg-amber-400";
  } else if (role === "pause") {
    text = "正在生成中场总结...";
    dotColor = "bg-amber-400";
  } else {
    const expert = expertId ? experts.find((e) => e.id === expertId) : undefined;
    text = `${expert?.name ?? "专家"}正在发言...${round ? `（第 ${round} 轮）` : ""}`;
    const colors = getExpertColors(expert?.avatarColor);
    dotColor = colors.dot;
    dotStyle = colors.style;
  }

  // 搜索状态：显示搜索图标动画 + 关键词
  if (searchStatus) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-gray-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 animate-pulse text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="text-sm text-blue-500">{searchStatus}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-2 py-3 text-gray-500">
      <div className="flex gap-1" style={dotStyle}>
        <span className={`h-2 w-2 animate-bounce rounded-full ${dotColor} [animation-delay:-0.3s]`}></span>
        <span className={`h-2 w-2 animate-bounce rounded-full ${dotColor} [animation-delay:-0.15s]`}></span>
        <span className={`h-2 w-2 animate-bounce rounded-full ${dotColor}`}></span>
      </div>
      <span className="text-sm">{text}</span>
    </div>
  );
}

export default TypingIndicator;
