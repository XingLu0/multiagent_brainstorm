"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface ReplayMessage {
  id: string;
  role: string;
  content: string;
  seq: number;
  createdAt: string;
  metadata?: string | null;
}

interface ReplayPlayerProps {
  messages: ReplayMessage[];
  totalMessages: number;
  onClose: () => void;
}

/**
 * P3-1: 讨论回放播放器
 *
 * 自动播放讨论消息，支持播放/暂停、速度控制（0.5x/1x/2x/4x）、进度拖拽。
 */
export function ReplayPlayer({ messages, totalMessages, onClose }: ReplayPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasMessages = messages.length > 0;
  const isAtEnd = currentIndex >= messages.length - 1;

  // 自动播放
  useEffect(() => {
    if (!isPlaying) return;
    if (isAtEnd) {
      // 使用 microtask 避免在 effect 体内同步调用 setState
      queueMicrotask(() => setIsPlaying(false));
      return;
    }
    timerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, messages.length - 1));
    }, 2000 / speed);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentIndex, speed, messages.length, isAtEnd]);

  const handlePlayPause = useCallback(() => {
    if (isAtEnd) {
      setCurrentIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  }, [isAtEnd]);

  const handleSeek = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsPlaying(false);
  }, []);

  // 获取角色显示名
  const getRoleLabel = (role: string): string => {
    if (role === "user") return "用户";
    if (role === "host") return "主持人";
    if (role === "summary") return "总结";
    if (role === "pause") return "暂停";
    if (role === "system") return "系统";
    if (role.startsWith("expert:")) return `专家 ${role.slice(7)}`;
    return role;
  };

  // 获取角色颜色
  const getRoleColor = (role: string): string => {
    if (role === "user") return "bg-blue-100 text-blue-800";
    if (role === "host") return "bg-purple-100 text-purple-800";
    if (role === "summary") return "bg-green-100 text-green-800";
    if (role.startsWith("expert:")) return "bg-orange-100 text-orange-800";
    return "bg-gray-100 text-gray-800";
  };

  const progress = hasMessages ? ((currentIndex + 1) / messages.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">讨论回放</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message display area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.slice(0, currentIndex + 1).map((msg) => (
            <div key={msg.id} className="mb-4">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${getRoleColor(msg.role)}`}>
                  {getRoleLabel(msg.role)}
                </span>
                <span className="text-xs text-gray-400">#{msg.seq}</span>
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-2 text-sm text-gray-800 whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          ))}
          {currentIndex === 0 && !isPlaying && (
            <p className="py-8 text-center text-sm text-gray-400">点击播放按钮开始回放</p>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-6 py-2">
          <div className="relative h-1.5 cursor-pointer rounded-full bg-gray-200"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              const index = Math.floor(percent * messages.length);
              handleSeek(Math.max(0, Math.min(index, messages.length - 1)));
            }}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-400">
            <span>{currentIndex + 1} / {messages.length}</span>
            <span>共 {totalMessages} 条消息</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between border-t px-6 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSeek(0)}
              disabled={!hasMessages}
              className="rounded-md p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
              title="回到开始"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handlePlayPause}
              disabled={!hasMessages}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30"
            >
              {isPlaying ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">速度</span>
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded px-2 py-1 text-xs ${
                  speed === s
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
