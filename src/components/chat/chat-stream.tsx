"use client";

import React, { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import { SummaryCard } from "./summary-card";
import { TypingIndicator } from "./typing-indicator";

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  expertId?: string;
  metadata?: string;
  round?: number;
}

interface ChatStreamProps {
  messages: ChatMessage[];
  isTyping: boolean;
  typingRole?: { role: "host" | "expert" | "summary" | "pause"; expertId?: string; round?: number };
  searchStatus?: string | null;
  onEditMessage?: (id: string, content: string) => void;
  disabled?: boolean;
}

/**
 * Container for all chat messages with auto-scroll to bottom.
 * Renders summary messages as SummaryCard, others as MessageBubble.
 */
export function ChatStream({
  messages,
  isTyping,
  typingRole,
  searchStatus,
  onEditMessage,
  disabled = false,
}: ChatStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((message) => {
          if (message.role === "summary" || message.role === "pause") {
            return <SummaryCard key={message.id} content={message.content} label={message.role === "pause" ? "中场总结" : undefined} />;
          }
          if (message.role === "system") {
            // 系统通知：居中灰色小卡片（如专家邀请/移除通知）
            return (
              <div key={message.id} className="flex justify-center py-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{message.content}</span>
                </div>
              </div>
            );
          }
          return (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
              expertId={message.expertId}
              metadata={message.metadata}
              messageId={message.id}
              onEdit={onEditMessage}
              editable={!disabled && message.role === "user"}
            />
          );
        })}
        {isTyping && <TypingIndicator typingRole={typingRole} searchStatus={searchStatus} />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default ChatStream;
