"use client";

import React, { useState } from "react";
import { useExperts } from "@/lib/hooks/use-experts";
import { getExpertColors } from "@/lib/experts/colors";
import { HookHighlight } from "./hook-highlight";

interface MessageBubbleProps {
  role: string;
  content: string;
  expertId?: string;
  metadata?: string;
  messageId?: string;
  onEdit?: (id: string, content: string) => void;
  editable?: boolean;
}

/**
 * Renders a single chat message bubble with role-based colors.
 * - user: blue (right-aligned), supports inline editing
 * - host: gray (left-aligned)
 * - expert: color-coded by expert avatarColor (left-aligned)
 */
export function MessageBubble({
  role,
  content,
  expertId,
  metadata,
  messageId,
  onEdit,
  editable = false,
}: MessageBubbleProps) {
  const { experts } = useExperts();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  // User message - right aligned, blue, with optional edit
  if (role === "user") {
    // 解析元数据，判断是否为用户干预指令（/ 开头的方向性干预）
    let isIntervene = false;
    if (metadata) {
      try {
        const meta = JSON.parse(metadata);
        if (meta.type === "intervene") isIntervene = true;
      } catch {
        // 元数据解析失败，视为普通用户消息
      }
    }

    if (isEditing) {
      return (
        <div className="flex justify-end">
          <div className="max-w-[80%] space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full rounded-2xl rounded-br-sm border-2 border-blue-300 bg-white px-4 py-2 text-sm text-gray-800 outline-none focus:border-blue-500"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditContent(content);
                  setIsEditing(false);
                }}
                className="rounded-lg px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editContent.trim() && messageId && onEdit) {
                    onEdit(messageId, editContent.trim());
                    setIsEditing(false);
                  }
                }}
                disabled={!editContent.trim()}
                className="rounded-lg bg-blue-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                保存并重新生成
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="group flex justify-end">
        <div className="relative max-w-[80%]">
          {/* 干预指令不提供编辑入口 */}
          {!isIntervene && editable && onEdit && messageId && (
            <button
              type="button"
              onClick={() => {
                setEditContent(content);
                setIsEditing(true);
              }}
              className="absolute -left-9 top-1 rounded-lg p-1.5 text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
              aria-label="编辑消息"
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
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
          )}
          {isIntervene && (
            <div className="mb-1 flex justify-end">
              <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                干预指令
              </span>
            </div>
          )}
          <div className="rounded-2xl rounded-br-sm bg-blue-500 px-4 py-2 text-white">
            <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Host message - left aligned, gray
  if (role === "host") {
    return (
      <div className="flex justify-start">
        <div className="flex max-w-[80%] items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-500 text-sm font-semibold text-white">
            主
          </div>
          <div className="min-w-0">
            <span className="mb-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              主持人
            </span>
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 text-gray-800">
              <HookHighlight content={content} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Expert message - left aligned, color-coded by expert
  const resolvedExpertId =
    expertId ?? (role.startsWith("expert:") ? role.slice(7) : undefined) ?? (() => {
      try {
        return metadata ? JSON.parse(metadata).expertId : undefined;
      } catch {
        return undefined;
      }
    })();

  const expert = resolvedExpertId
    ? experts.find((e) => e.id === resolvedExpertId)
    : undefined;
  const colors = getExpertColors(expert?.avatarColor);

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[80%] items-start gap-2" style={colors.style}>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colors.avatar} text-sm font-semibold text-white`}
        >
          {expert?.name.charAt(0) ?? "专"}
        </div>
        <div className="min-w-0">
          <span className={`mb-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${colors.badge}`}>
            {expert?.name ?? "专家"}
          </span>
          <div
            className={`rounded-2xl rounded-bl-sm border bg-white px-4 py-2 shadow-sm ${colors.bubble} text-gray-800`}
          >
            <HookHighlight content={content} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
