"use client";

import React, { useState, useEffect } from "react";

interface ExpertStats {
  expertId: string;
  expertName: string;
  totalProjects: number;
  totalMessages: number;
  consensusContributionRate: number;
  mostDiscussedTopics: Array<{ topic: string; count: number }>;
  averageMessagesPerProject: number;
  projectBreakdown: Array<{
    projectId: string;
    projectTitle: string;
    messageCount: number;
    consensusCount: number;
    divergenceCount: number;
  }>;
}

interface ExpertDashboardProps {
  expertId: string;
  expertName: string;
}

export function ExpertDashboard({ expertId, expertName }: ExpertDashboardProps) {
  const [stats, setStats] = useState<ExpertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/experts/${expertId}/stats`)
      .then((res) => {
        if (!res.ok) throw new Error("加载失败");
        return res.json();
      })
      .then((data: ExpertStats) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => {
        setError("加载统计数据失败");
        setLoading(false);
      });
  }, [expertId]);

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-400">加载中...</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-red-500">{error}</div>;
  }

  if (!stats || stats.totalProjects === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        {expertName} 暂无参与项目记录
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="参与项目" value={stats.totalProjects.toString()} />
        <StatCard label="总消息数" value={stats.totalMessages.toString()} />
        <StatCard
          label="共识贡献率"
          value={stats.consensusContributionRate.toFixed(1)}
          suffix="/项目"
        />
        <StatCard
          label="平均消息数"
          value={stats.averageMessagesPerProject.toFixed(1)}
          suffix="/项目"
        />
      </div>

      {/* 高频话题 */}
      {stats.mostDiscussedTopics.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700">高频话题</h4>
          <div className="flex flex-wrap gap-2">
            {stats.mostDiscussedTopics.map((t, i) => (
              <span
                key={i}
                className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700"
              >
                {t.topic} ({t.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 项目明细 */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-700">项目明细</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">项目</th>
                <th className="py-2 px-4 text-center">消息数</th>
                <th className="py-2 px-4 text-center">共识</th>
                <th className="py-2 px-4 text-center">分歧</th>
              </tr>
            </thead>
            <tbody>
              {stats.projectBreakdown.map((p) => (
                <tr key={p.projectId} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-gray-700">{p.projectTitle}</td>
                  <td className="py-2 px-4 text-center text-gray-600">{p.messageCount}</td>
                  <td className="py-2 px-4 text-center text-green-600">{p.consensusCount}</td>
                  <td className="py-2 px-4 text-center text-orange-600">{p.divergenceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-gray-900">
        {value}
        {suffix && <span className="ml-1 text-xs font-normal text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}
