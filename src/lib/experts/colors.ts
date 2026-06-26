/**
 * 共享专家配色方案
 * 统一 message-bubble、expert-picker、project-card、typing-indicator 的颜色映射
 */

import type { CSSProperties } from "react";
import { isHexColor } from "./types";

export interface ExpertColorScheme {
  avatar: string;
  badge: string;
  bubble: string;
  border: string;
  ring: string;
  bg: string;
  dot: string;
  style?: CSSProperties;
}

export const expertColorMap: Record<string, ExpertColorScheme> = {
  emerald: {
    avatar: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
    bubble: "border-emerald-100",
    border: "border-emerald-500",
    ring: "ring-emerald-500",
    bg: "bg-emerald-50/50",
    dot: "bg-emerald-500",
  },
  orange: {
    avatar: "bg-orange-500",
    badge: "bg-orange-50 text-orange-700",
    bubble: "border-orange-100",
    border: "border-orange-500",
    ring: "ring-orange-500",
    bg: "bg-orange-50/50",
    dot: "bg-orange-500",
  },
  violet: {
    avatar: "bg-violet-500",
    badge: "bg-violet-50 text-violet-700",
    bubble: "border-violet-100",
    border: "border-violet-500",
    ring: "ring-violet-500",
    bg: "bg-violet-50/50",
    dot: "bg-violet-500",
  },
  pink: {
    avatar: "bg-pink-500",
    badge: "bg-pink-50 text-pink-700",
    bubble: "border-pink-100",
    border: "border-pink-500",
    ring: "ring-pink-500",
    bg: "bg-pink-50/50",
    dot: "bg-pink-500",
  },
  teal: {
    avatar: "bg-teal-500",
    badge: "bg-teal-50 text-teal-700",
    bubble: "border-teal-100",
    border: "border-teal-500",
    ring: "ring-teal-500",
    bg: "bg-teal-50/50",
    dot: "bg-teal-500",
  },
};

/**
 * 为 HEX 颜色生成配色方案
 * 使用 CSS 变量 --ec + Tailwind 任意值类 + color-mix()
 */
function hexScheme(hex: string): ExpertColorScheme {
  return {
    avatar: "bg-[var(--ec)]",
    badge: "bg-[color-mix(in_srgb,var(--ec)_12%,transparent)] text-[var(--ec)]",
    bubble: "border-[color-mix(in_srgb,var(--ec)_30%,transparent)]",
    border: "border-[var(--ec)]",
    ring: "ring-[var(--ec)]",
    bg: "bg-[color-mix(in_srgb,var(--ec)_8%,transparent)]",
    dot: "bg-[var(--ec)]",
    style: { "--ec": hex } as CSSProperties,
  };
}

/**
 * 获取配色方案，未知颜色回退到 emerald
 * 支持预设色名和 HEX 颜色（#rrggbb）
 */
export function getExpertColors(
  avatarColor: string | undefined
): ExpertColorScheme {
  if (avatarColor && isHexColor(avatarColor)) return hexScheme(avatarColor);
  return expertColorMap[avatarColor ?? "emerald"] ?? expertColorMap.emerald;
}
