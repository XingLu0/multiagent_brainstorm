"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";

const Timeline = dynamic(() => import("./timeline"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded bg-gray-100" /> });
const WordCloud = dynamic(() => import("./word-cloud"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded bg-gray-100" /> });
const ControversyMatrix = dynamic(() => import("./controversy-matrix"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded bg-gray-100" /> });
const HeatMap = dynamic(() => import("./heat-map"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded bg-gray-100" /> });

type TabId = "timeline" | "wordcloud" | "controversy" | "heatmap";

interface VisualizationTabsProps {
  messages: Array<{ role: string; content: string; seq: number; createdAt: string; metadata?: string | null }>;
  experts: Array<{ id: string; name: string }>;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "timeline", label: "时间线" },
  { id: "wordcloud", label: "词云" },
  { id: "controversy", label: "争议矩阵" },
  { id: "heatmap", label: "热度图" },
];

export function VisualizationTabs({ messages, experts }: VisualizationTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>("timeline");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-4 flex gap-2 border-b pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[256px]">
        {activeTab === "timeline" && <Timeline messages={messages} />}
        {activeTab === "wordcloud" && <WordCloud messages={messages} />}
        {activeTab === "controversy" && <ControversyMatrix messages={messages} experts={experts} />}
        {activeTab === "heatmap" && <HeatMap messages={messages} />}
      </div>
    </div>
  );
}
