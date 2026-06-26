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
 * When searchStatus is set, shows the search query instead of the default text.
 */
export function TypingIndicator({ typingRole, searchStatus }: TypingIndicatorProps) {
  const { experts } = useExperts();
  const role = typingRole?.role ?? "host";
  const expertId = typingRole?.expertId;

  let text: string;
  let dotColor: string;
  let dotStyle: React.CSSProperties | undefined;

  if (role === "host") {
    text = "主持人正在思考...";
    dotColor = "bg-gray-400";
  } else if (role === "summary") {
    text = "正在生成总结...";
    dotColor = "bg-amber-400";
  } else if (role === "pause") {
    text = "正在生成中场总结...";
    dotColor = "bg-amber-400";
  } else {
    const expert = expertId ? experts.find((e) => e.id === expertId) : undefined;
    text = `${expert?.name ?? "专家"}正在思考...`;
    const colors = getExpertColors(expert?.avatarColor);
    dotColor = colors.dot;
    dotStyle = colors.style;
  }

  return (
    <div className="flex items-center gap-2 px-2 py-3 text-gray-500">
      <div className="flex gap-1" style={dotStyle}>
        <span className={`h-2 w-2 animate-bounce rounded-full ${dotColor} [animation-delay:-0.3s]`}></span>
        <span className={`h-2 w-2 animate-bounce rounded-full ${dotColor} [animation-delay:-0.15s]`}></span>
        <span className={`h-2 w-2 animate-bounce rounded-full ${dotColor}`}></span>
      </div>
      <span className="text-sm">{searchStatus ?? text}</span>
    </div>
  );
}

export default TypingIndicator;
