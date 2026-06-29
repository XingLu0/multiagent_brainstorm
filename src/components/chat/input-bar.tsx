"use client";

import React, { useState, useCallback, useRef, type KeyboardEvent } from "react";
import { parseFile, type ParsedFile } from "@/lib/file-parser";

/** 附件对象（与 parseFile 返回的 ParsedFile 结构一致） */
export type Attachment = ParsedFile;

interface InputBarProps {
  onSend: (text: string, attachments?: Attachment[]) => void;
  onSummarize: () => void;
  onStop?: () => void;
  onSoftStop?: () => void;
  onContinue?: (text: string) => void;
  /** 用户干预指令回调：以 / 开头的消息走干预通道，仅持久化不触发专家即时回应 */
  onIntervene?: (directive: string) => void;
  isPaused?: boolean;
  isSoftStopping?: boolean;
  disabled: boolean;
  placeholder?: string;
}

/** 文件选择器 accept 属性：仅允许文本类文件 */
const ACCEPTED_FILE_TYPES = ".txt,.md,.csv,.json,.log";

/**
 * Chat input bar with textarea, send button, summarize button, and stop button.
 * Enter to send, Shift+Enter for newline.
 * When disabled (AI is responding), shows a "停止生成" button.
 * When paused (mid-discussion summary), shows a "继续讨论" button.
 *
 * 支持附件上传：点击回形针按钮选择文本文件，已选文件以 chip 形式展示，
 * 发送时附带解析后的附件内容。
 */
export function InputBar({ onSend, onSummarize, onStop, onSoftStop, onContinue, onIntervene, isPaused, isSoftStopping, disabled, placeholder }: InputBarProps) {
  const [text, setText] = useState("");
  // 已选附件列表（内部管理，发送后清空）
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // 文件上传是否正在解析
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 干预模式：输入文本以 / 开头时启用，消息将走 onIntervene 通道
  const isInterveneMode = text.trimStart().startsWith("/");

  // 移除指定索引的附件
  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // 处理文件选择：解析所有选中文件并追加到附件列表
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setParsing(true);
      try {
        const parsed: Attachment[] = [];
        for (const file of Array.from(files)) {
          const result = await parseFile(file);
          parsed.push(result);
        }
        setAttachments((prev) => [...prev, ...parsed]);
      } finally {
        setParsing(false);
        // 重置 input value，便于重复选择同一文件
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    []
  );

  // 触发文件选择器
  const handlePaperclipClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    // 干预模式：以 / 开头且提供了 onIntervene 回调
    const interveneMode = trimmed.startsWith("/") && !!onIntervene;

    if (interveneMode) {
      // 干预指令必须有非空文本，且未禁用
      if (!trimmed || disabled) return;
      onIntervene!(trimmed);
      setText("");
      setAttachments([]);
      return;
    }

    // 普通消息：文本和附件不能同时为空（保留原行为：允许仅附件无文本）
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setText("");
    setAttachments([]);
  }, [text, attachments, disabled, onSend, onIntervene]);

  const handleContinueAction = useCallback(() => {
    const trimmed = text.trim();
    onContinue?.(trimmed);
    setText("");
  }, [text, onContinue]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        // 干预模式优先（以 / 开头）：Enter 直接发送干预指令
        if (isInterveneMode && onIntervene) {
          handleSend();
        } else if (isPaused && onContinue) {
          handleContinueAction();
        } else {
          handleSend();
        }
      }
    },
    [handleSend, handleContinueAction, isPaused, onContinue, isInterveneMode, onIntervene]
  );

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* 已选附件 chip 列表 */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((att, index) => (
              <span
                key={`${att.name}-${index}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 py-1 pl-3 pr-1.5 text-xs text-gray-700"
                title={att.text.length > 100 ? `${att.text.slice(0, 100)}...` : att.text}
              >
                {/* 附件类型图标 */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 shrink-0 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="max-w-[180px] truncate font-medium">{att.name}</span>
                {/* 移除按钮 */}
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  disabled={parsing}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 disabled:cursor-not-allowed"
                  aria-label={`移除附件 ${att.name}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 干预模式提示面板：输入以 / 开头时显示可用指令补全 */}
        {isInterveneMode && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <div className="font-medium">
              干预模式：以 / 开头的指令将作为方向性干预发送，不会触发专家立即回应，而是在下一轮讨论中引导专家方向。
            </div>
            <ul className="mt-1.5 space-y-1 text-amber-700">
              <li>
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">/focus &lt;主题&gt;</code>
                — 引导专家聚焦指定主题
              </li>
              <li>
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">/ask &lt;专家名&gt; &lt;问题&gt;</code>
                — 向指定专家提问
              </li>
              <li>
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">/redirect &lt;新方向&gt;</code>
                — 将讨论重定向到新方向
              </li>
            </ul>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* 总结按钮 */}
          <button
            type="button"
            onClick={onSummarize}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            总结一下
          </button>

          {/* 回形针附件按钮 */}
          <button
            type="button"
            onClick={handlePaperclipClick}
            disabled={disabled || parsing}
            className="shrink-0 rounded-lg border border-gray-300 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="添加附件"
            title="添加文本附件"
          >
            {parsing ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            )}
          </button>

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={isPaused ? "可补充你的偏好或信息，也可直接继续讨论..." : (placeholder ?? "输入你的想法...")}
            rows={1}
            className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {disabled && isSoftStopping && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              强制停止
            </button>
          ) : disabled && !isSoftStopping && onSoftStop ? (
            <button
              type="button"
              onClick={onSoftStop}
              className="shrink-0 rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50"
            >
              软停止
            </button>
          ) : disabled && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              停止生成
            </button>
          ) : isInterveneMode && onIntervene ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || !text.trim()}
              className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              发送干预
            </button>
          ) : isPaused && onContinue ? (
            <button
              type="button"
              onClick={handleContinueAction}
              className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
            >
              继续讨论
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || (!text.trim() && attachments.length === 0)}
              className="shrink-0 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default InputBar;
