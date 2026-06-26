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
