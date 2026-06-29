"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExperts } from "@/lib/hooks/use-experts";
import { getExpertColors } from "@/lib/experts/colors";

interface ProjectCardProps {
  project: {
    id: string;
    title: string;
    expertIds: string;
    status: string;
    createdAt: string | Date;
    _count?: { messages: number };
  };
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "进行中", className: "bg-green-100 text-green-700" },
  completed: { label: "已完成", className: "bg-gray-100 text-gray-600" },
};

/**
 * Project card with project info, expert badges, status badge.
 * Links to chat page (active) or results page (completed).
 * Delete button with confirmation dialog.
 */
export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const { experts } = useExperts();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const expertIds = JSON.parse(project.expertIds) as string[];
  const projectExperts = expertIds
    .map((id) => experts.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const status = statusConfig[project.status] ?? statusConfig.active;
  const messageCount = project._count?.messages ?? 0;
  const createdAt = new Date(project.createdAt);

  const linkHref =
    project.status === "completed"
      ? `/projects/${project.id}/results`
      : `/projects/${project.id}`;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/projects/${project.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // Error handling - could show a toast in the future
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <Link href={linkHref} className="block">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-lg font-semibold text-gray-900">
            {project.title}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
          >
            {status.label}
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {projectExperts.map((expert) => {
            const colors = getExpertColors(expert.avatarColor);
            return (
              <span
                key={expert.id}
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${colors.badge}`}
                style={colors.style}
              >
                {expert.name}
              </span>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{createdAt.toLocaleDateString("zh-CN")}</span>
          <span>{messageCount} 条消息</span>
        </div>
      </Link>

      {/* Delete button / confirmation */}
      <div className="absolute right-3 top-3">
        {confirming ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-md">
            <span className="text-xs text-gray-600">确定删除？</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded bg-red-500 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {deleting ? "删除中..." : "确认"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirming(false);
              }}
              className="rounded px-2 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirming(true);
            }}
            className="rounded-lg p-1.5 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
            aria-label="删除项目"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default ProjectCard;
