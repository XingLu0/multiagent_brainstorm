"use client";

import React from "react";
import { buildHeatMapData, type VizMessage } from "@/lib/visualization";

interface HeatMapProps {
  messages: VizMessage[];
}

const COL_LABELS = ["用户", "主持人", "专家", "总结/暂停"];
const ROW_LABELS = ["早", "", "", "中", "", "晚"];

function intensityToColor(intensity: number): string {
  if (intensity === 0) return "bg-gray-50";
  if (intensity < 0.25) return "bg-blue-100";
  if (intensity < 0.5) return "bg-blue-300";
  if (intensity < 0.75) return "bg-blue-500";
  return "bg-blue-700";
}

export default function HeatMap({ messages }: HeatMapProps) {
  const grid = buildHeatMapData(messages);

  return (
    <div className="py-2">
      <div className="flex gap-2">
        {/* Row labels */}
        <div className="flex flex-col justify-around pr-1 text-xs text-gray-400">
          {ROW_LABELS.map((label, i) => (
            <div key={i} className="h-10 flex items-center">{label}</div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1">
          {/* Column labels */}
          <div className="mb-1 flex gap-1">
            {COL_LABELS.map((label, i) => (
              <div key={i} className="flex-1 text-center text-xs text-gray-500">{label}</div>
            ))}
          </div>

          {/* Cells */}
          {grid.map((row, r) => (
            <div key={r} className="flex gap-1">
              {row.map((cell, c) => (
                <div
                  key={c}
                  className={`h-10 flex-1 rounded ${intensityToColor(cell.intensity)} flex items-center justify-center text-xs ${cell.intensity > 0.5 ? "text-white" : "text-gray-600"}`}
                  title={`消息数: ${cell.count}`}
                >
                  {cell.count > 0 ? cell.count : ""}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
