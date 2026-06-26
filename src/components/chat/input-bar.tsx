"use client";

import React, { useState, useCallback, type KeyboardEvent } from "react";

interface InputBarProps {
  onSend: (text: string) => void;
  onSummarize: () => void;
  onStop?: () => void;
  onContinue?: (text: string) => void;
  isPaused?: boolean;
  disabled: boolean;
  placeholder?: string;
}

/**
 * Chat input bar with textarea, send button, summarize button, and stop button.
 * Enter to send, Shift+Enter for newline.
 * When disabled (AI is responding), shows a "停止生成" button.
 * When paused (mid-discussion summary), shows a "继续讨论" button.
 */
export function InputBar({ onSend, onSummarize, onStop, onContinue, isPaused, disabled, placeholder }: InputBarProps) {
  const [text, setText] = useState("");

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }, [text, disabled, onSend]);

  const handleContinueAction = useCallback(() => {
    const trimmed = text.trim();
    onContinue?.(trimmed);
    setText("");
  }, [text, onContinue]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (isPaused && onContinue) {
          handleContinueAction();
        } else {
          handleSend();
        }
      }
    },
    [handleSend, handleContinueAction, isPaused, onContinue]
  );

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <button
          type="button"
          onClick={onSummarize}
          disabled={disabled}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          总结一下
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={isPaused ? "可补充你的偏好或信息，也可直接继续讨论..." : (placeholder ?? "输入你的想法...")}
          rows={1}
          className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {disabled && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            停止生成
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
            disabled={disabled || !text.trim()}
            className="shrink-0 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}

export default InputBar;
