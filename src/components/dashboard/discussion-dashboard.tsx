"use client";

import React from "react";
import type { DiscussionPhase, DiscussionState } from "@/lib/engine/discussion-state";
import { getExpertColors } from "@/lib/experts/colors";

interface DashboardProps {
  state: DiscussionState;
}

/**
 * 阶段徽标配置：标签 + 配色
 * idle=灰色、hosting=蓝色、discussing=绿色、paused=黄色、summarizing=紫色、completed=深灰色
 */
const PHASE_CONFIG: Record<DiscussionPhase, { label: string; badge: string; bar: string }> = {
  idle: { label: "待开始", badge: "bg-gray-100 text-gray-600", bar: "bg-gray-400" },
  hosting: { label: "引导中", badge: "bg-blue-100 text-blue-700", bar: "bg-blue-500" },
  discussing: { label: "讨论中", badge: "bg-green-100 text-green-700", bar: "bg-green-500" },
  paused: { label: "已暂停", badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  summarizing: { label: "总结中", badge: "bg-violet-100 text-violet-700", bar: "bg-violet-500" },
  completed: { label: "已结束", badge: "bg-gray-800 text-white", bar: "bg-gray-600" },
};

/**
 * 讨论状态可视化看板
 * 横向条带布局，位于 header 与 ChatStream 之间，展示：
 * - 阶段徽标（颜色随 phase 变化）
 * - 进度条（completedTurns / totalTurns）+ 轮次文字
 * - 专家头像矩阵（已发言/正在发言/未发言）
 * - 分歧/共识计数
 */
export function DiscussionDashboard({ state }: DashboardProps) {
  const config = PHASE_CONFIG[state.phase];
  const pct =
    state.totalTurns > 0
      ? Math.min(100, Math.round((state.completedTurns / state.totalTurns) * 100))
      : 0;

  const showCounts = state.divergences > 0 || state.consensus > 0;

  return (
    <div className="flex h-16 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-4">
      {/* 左侧：阶段徽标 */}
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${config.badge}`}
      >
        {config.label}
      </span>

      {/* 中间：进度条 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${config.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            第 {Math.min(state.currentRound + 1, state.maxRounds)} 轮 / 最多{" "}
            {state.maxRounds} 轮
          </span>
          <span>
            {state.completedTurns}
            {state.totalTurns > 0 ? ` / ${state.totalTurns}` : ""}
          </span>
        </div>
      </div>

      {/* 右侧：专家头像矩阵 */}
      {state.activeExperts.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5">
          {state.activeExperts.map((expert) => {
            const colors = getExpertColors(expert.avatarColor);
            const isActive = expert.speaking || expert.spoken;
            const titleSuffix = expert.speaking
              ? "（发言中）"
              : expert.spoken
              ? "（已发言）"
              : "（未发言）";
            return (
              <div
                key={expert.id}
                title={`${expert.name}${titleSuffix}`}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white ${
                  expert.speaking
                    ? `${colors.avatar} animate-pulse ring-2 ring-offset-1 ${colors.ring}`
                    : expert.spoken
                    ? `${colors.avatar} ring-1 ${colors.ring}`
                    : "bg-gray-200 text-gray-400"
                } ${!isActive ? "opacity-50" : ""}`}
                style={colors.style}
              >
                {expert.name.charAt(0)}
              </div>
            );
          })}
        </div>
      )}

      {/* 最右侧：分歧/共识计数 */}
      {showCounts && (
        <div className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
          <span>
            共识 <span className="font-medium text-green-600">{state.consensus}</span>
          </span>
          <span className="text-gray-300">·</span>
          <span>
            分歧 <span className="font-medium text-amber-600">{state.divergences}</span>
          </span>
        </div>
      )}
    </div>
  );
}
