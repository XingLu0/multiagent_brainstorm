"use client";

import React, { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChatStream, type ChatMessage } from "@/components/chat/chat-stream";
import { InputBar } from "@/components/chat/input-bar";
import { parseSSEStream } from "@/lib/sse";
import { fetchWithConfig } from "@/lib/client-config";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

interface ApiMessage {
  id: string;
  role: string;
  content: string;
  metadata?: string | null;
  createdAt: string;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeMessage(msg: ApiMessage): ChatMessage {
  let role = msg.role;
  let expertId: string | undefined;
  let round: number | undefined;

  if (msg.role.startsWith("expert:")) {
    role = "expert";
    expertId = msg.role.slice(7);
  }
  if (msg.metadata) {
    try {
      const meta = JSON.parse(msg.metadata);
      if (meta.expertId) {
        expertId = meta.expertId;
      }
      if (meta.round !== undefined) {
        round = meta.round;
      }
    } catch {
      // ignore parse errors
    }
  }

  return {
    id: msg.id,
    role,
    content: msg.content,
    expertId,
    metadata: msg.metadata ?? undefined,
    round,
  };
}

export default function ChatPage({ params }: ChatPageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [project, setProject] = useState<{
    title: string;
    status: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingRole, setTypingRole] = useState<{
    role: "host" | "expert" | "summary" | "pause";
    expertId?: string;
    round?: number;
  }>({ role: "host" });
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string>("");
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [endingProgress, setEndingProgress] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "failed"
  >("idle");
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseRemainingTurns, setPauseRemainingTurns] = useState<number | undefined>(undefined);
  const pausedRef = useRef(false);

  const abortRef = useRef<AbortController | null>(null);
  const endAbortRef = useRef<AbortController | null>(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch project (includes messages and documents) on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const projectRes = await fetch(`/api/projects/${id}`);

        if (!projectRes.ok) {
          if (projectRes.status === 404) {
            throw new Error("项目不存在");
          }
          throw new Error("项目加载失败");
        }

        const projectData = await projectRes.json();
        setProject({ title: projectData.title, status: projectData.status });

        // Messages are included in the project response
        if (projectData.messages) {
          const normalized = projectData.messages.map(normalizeMessage);
          setMessages(normalized);

          // 检测加载时是否处于暂停态：最后一条消息为 pause 且元数据可解析
          const lastMsg = normalized[normalized.length - 1];
          if (lastMsg && lastMsg.role === "pause" && lastMsg.metadata) {
            try {
              const meta = JSON.parse(lastMsg.metadata);
              if (typeof meta.totalTurns === "number" && typeof meta.completedTurns === "number") {
                setIsPaused(true);
                setPauseRemainingTurns(meta.totalTurns - meta.completedTurns);
              }
            } catch {
              // 元数据解析失败，保持非暂停态
            }
          }
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "加载数据失败");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // Handle streaming chunks - append to last message if same type+expert+round, else create new
  const handleStreamChunk = useCallback(
    (role: string, content: string, expertId?: string, round?: number) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === role && last.expertId === expertId && last.round === round) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + content },
          ];
        }
        return [...prev, { id: generateId(), role, content, expertId, round }];
      });
    },
    []
  );

  // Reload messages from DB to sync frontend state with actual persisted data
  const reloadMessagesFromDB = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages.map(normalizeMessage));
      }
    } catch {
      // Silent fail — don't disrupt the error toast
    }
  }, [id]);

  // Factory for shared SSE stream handlers (used by sendMessage, handleRetry, handleEditMessage)
  const createStreamHandlers = useCallback(
    (errorPrefix: string) => ({
      onHost: (data: { content: string; expertIds?: string[] }) => {
        setSearchStatus(null);
        setTypingRole({ role: "host" });
        handleStreamChunk("host", data.content);
      },
      onExpertStart: (data: { expertId: string; round: number }) => {
        setTypingRole({ role: "expert", expertId: data.expertId, round: data.round });
      },
      onExpert: (data: { content: string; expertId: string; round?: number }) => {
        setSearchStatus(null);
        setTypingRole({ role: "expert", expertId: data.expertId, round: data.round });
        handleStreamChunk("expert", data.content, data.expertId, data.round);
      },
      onSummary: (data: { content: string }) => {
        setTypingRole({ role: "summary" });
        handleStreamChunk("summary", data.content);
      },
      onPause: (data: { content: string; remainingTurns?: number }) => {
        setTypingRole({ role: "pause" });
        handleStreamChunk("pause", data.content);
        pausedRef.current = true;
        setPauseRemainingTurns(data.remainingTurns);
      },
      onToolCall: (data: { expertId: string | null; toolName: string; input: unknown }) => {
        if (data.toolName === "webSearch") {
          const queries =
            typeof data.input === "object" && data.input
              ? (data.input as { queries?: string[] }).queries ?? []
              : [];
          const label = queries.length > 0 ? queries.join(" / ") : "未知关键词";
          setSearchStatus(`正在搜索：${label}`);
        }
      },
      onError: (data: { message: string; retryable: boolean }) => {
        pausedRef.current = false;
        setError(data.message);
        setToast(`${errorPrefix}: ${data.message}`);
        reloadMessagesFromDB();
      },
    }),
    [handleStreamChunk, reloadMessagesFromDB]
  );

  // Send a message via SSE
  const sendMessage = useCallback(
    async (content: string) => {
      setMessages((prev) => [...prev, { id: generateId(), role: "user", content }]);

      setTypingRole({ role: "host" });
      setIsTyping(true);
      setError(null);
      setLastMessage(content);
      pausedRef.current = false;

      const controller = new AbortController();
      abortRef.current = controller;

      let streamStarted = false;
      try {
        const response = await fetchWithConfig(`/api/sessions/${id}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error ?? `请求失败 (${response.status})`);
        }

        streamStarted = true;
        await parseSSEStream(response, createStreamHandlers("生成失败"));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // User cancelled
        } else {
          const msg = e instanceof Error ? e.message : "发送失败";
          setError(msg);
          setToast(`生成失败: ${msg}`);
          if (streamStarted) {
            await reloadMessagesFromDB();
          }
        }
      } finally {
        setIsTyping(false);
        setSearchStatus(null);
        abortRef.current = null;
        if (pausedRef.current) setIsPaused(true);
      }
    },
    [id, createStreamHandlers, reloadMessagesFromDB]
  );

  const handleSend = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsTyping(false);
    }
  }, []);

  // 继续被暂停的专家讨论（可选附带用户补充输入）
  const handleContinue = useCallback(
    async (text: string) => {
      const userInput = text.trim() || null;

      // 若用户补充了输入，先在前端追加用户消息（与后端持久化保持一致）
      if (userInput) {
        setMessages((prev) => [...prev, { id: generateId(), role: "user", content: userInput }]);
      }

      setIsPaused(false);
      pausedRef.current = false;
      setTypingRole({ role: "expert" });
      setIsTyping(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      let streamStarted = false;
      try {
        const response = await fetchWithConfig(`/api/sessions/${id}/continue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userInput }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error ?? `请求失败 (${response.status})`);
        }

        streamStarted = true;
        await parseSSEStream(response, createStreamHandlers("继续失败"));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // 用户取消
        } else {
          const msg = e instanceof Error ? e.message : "继续失败";
          setError(msg);
          setToast(`继续失败: ${msg}`);
          if (streamStarted) {
            await reloadMessagesFromDB();
          }
        }
      } finally {
        setIsTyping(false);
        setSearchStatus(null);
        abortRef.current = null;
        if (pausedRef.current) setIsPaused(true);
      }
    },
    [id, createStreamHandlers, reloadMessagesFromDB]
  );

  const handleRetry = useCallback(async () => {
    if (!lastMessage) return;
    pausedRef.current = false;

    // Reload from DB to sync frontend state and find the last user message
    let lastUserMsg: ChatMessage | undefined;
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          const reloaded = data.messages.map(normalizeMessage);
          setMessages(reloaded);
          lastUserMsg = [...reloaded].reverse().find((m) => m.role === "user");
        }
      }
    } catch {
      // If reload fails, fall back to current state
    }

    // Fallback: search in current messages state
    if (!lastUserMsg) {
      lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    }

    // No matching user message in DB (e.g. 400 validation error) → send as new message
    if (!lastUserMsg || lastUserMsg.content !== lastMessage) {
      sendMessage(lastMessage);
      return;
    }

    // Use edit-message endpoint: deletes subsequent messages + regenerates (no duplicate user message)
    setTypingRole({ role: "host" });
    setIsTyping(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    let streamStarted = false;
    try {
      const response = await fetchWithConfig(
        `/api/sessions/${id}/edit-message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: lastUserMsg.id, content: lastMessage }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? `请求失败 (${response.status})`);
      }

      streamStarted = true;
      await parseSSEStream(response, createStreamHandlers("重试失败"));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // User cancelled
      } else {
        const msg = e instanceof Error ? e.message : "重试失败";
        setError(msg);
        setToast(`重试失败: ${msg}`);
        if (streamStarted) {
          await reloadMessagesFromDB();
        }
      }
    } finally {
      setIsTyping(false);
      setSearchStatus(null);
      abortRef.current = null;
    }
  }, [id, lastMessage, messages, sendMessage, createStreamHandlers, reloadMessagesFromDB]);

  // Edit a user message: truncate subsequent messages, update content, regenerate
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      setIsPaused(false);
      pausedRef.current = false;
      // Find the target message and truncate everything after it
      const editIndex = messages.findIndex((m) => m.id === messageId);
      if (editIndex === -1) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        const updated = [...prev.slice(0, idx)];
        updated[idx] = { ...prev[idx], content: newContent };
        return updated;
      });

      setTypingRole({ role: "host" });
      setIsTyping(true);
      setError(null);
      setLastMessage(newContent);

      const controller = new AbortController();
      abortRef.current = controller;

      let streamStarted = false;
      try {
        const response = await fetchWithConfig(
          `/api/sessions/${id}/edit-message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId, content: newContent }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error ?? `请求失败 (${response.status})`);
        }

        streamStarted = true;
        await parseSSEStream(response, createStreamHandlers("编辑失败"));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // User cancelled
        } else {
          const msg = e instanceof Error ? e.message : "编辑失败";
          setError(msg);
          setToast(`编辑失败: ${msg}`);
          if (streamStarted) {
            await reloadMessagesFromDB();
          }
        }
      } finally {
        setIsTyping(false);
        setSearchStatus(null);
        abortRef.current = null;
      }
    },
    [id, createStreamHandlers, reloadMessagesFromDB]
  );

  // Trigger manual summary via SSE
  const handleSummarize = useCallback(async () => {
    setTypingRole({ role: "summary" });
    setIsTyping(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetchWithConfig(`/api/sessions/${id}/summarize`, {
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("总结请求失败");
      }

      await parseSSEStream(response, {
        onSummary: (data) => handleStreamChunk("summary", data.content),
        onError: (data) => {
          setError(data.message);
          setToast(`总结失败: ${data.message}`);
        },
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // User cancelled
      } else {
        const msg = e instanceof Error ? e.message : "总结失败";
        setError(msg);
        setToast(`总结失败: ${msg}`);
      }
    } finally {
      setIsTyping(false);
      abortRef.current = null;
    }
  }, [id, handleStreamChunk]);

  // End brainstorm and generate minutes via SSE, then redirect
  const handleEnd = useCallback(async () => {
    setShowEndConfirm(false);
    setIsEnding(true);
    setEndingProgress("");
    setError(null);

    const controller = new AbortController();
    endAbortRef.current = controller;

    try {
      const response = await fetchWithConfig(`/api/sessions/${id}/end`, {
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("结束脑暴失败");
      }

      let minutes = "";
      let hadError = false;
      await parseSSEStream(response, {
        onMinutes: (data) => {
          minutes += data.content;
          setEndingProgress(minutes);
        },
        onError: (data) => {
          hadError = true;
          setError(data.message);
          setToast(`纪要生成失败: ${data.message}`);
        },
      });

      if (hadError) {
        setIsEnding(false);
        return;
      }

      router.push(`/projects/${id}/results`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setIsEnding(false);
      } else {
        const msg = e instanceof Error ? e.message : "结束脑暴失败";
        setError(msg);
        setToast(`纪要生成失败: ${msg}`);
        setIsEnding(false);
      }
    } finally {
      endAbortRef.current = null;
    }
  }, [id, router]);

  // Stop minutes generation
  const handleStopEnd = useCallback(() => {
    endAbortRef.current?.abort();
    endAbortRef.current = null;
    setIsEnding(false);
  }, []);

  // Test LLM connection
  const handleTestConnection = useCallback(async () => {
    setConnectionStatus("testing");
    try {
      const res = await fetchWithConfig("/api/test-connection");
      const data = await res.json();
      if (data.success) {
        setConnectionStatus("success");
        setToast(`连接成功！模型: ${data.model}`);
      } else {
        setConnectionStatus("failed");
        setToast(`连接失败: ${data.message}`);
      }
    } catch (e) {
      setConnectionStatus("failed");
      setToast(`连接失败: ${e instanceof Error ? e.message : "未知错误"}`);
    }
  }, []);

  const isCompleted = project?.status === "completed";

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-1">
            <span className="h-3 w-3 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]"></span>
            <span className="h-3 w-3 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]"></span>
            <span className="h-3 w-3 animate-bounce rounded-full bg-blue-500"></span>
          </div>
          <p className="text-sm text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  // Load error state
  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-4 text-center">
            <p className="font-medium text-red-700">{loadError}</p>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            返回项目列表
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="返回"
          >
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-gray-900">
              {project?.title ?? "脑暴"}
            </h1>
            {isCompleted && (
              <span className="text-xs text-gray-500">脑暴已结束</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Test connection button */}
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={connectionStatus === "testing"}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              connectionStatus === "success"
                ? "border-green-300 bg-green-50 text-green-700"
                : connectionStatus === "failed"
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            } disabled:cursor-not-allowed disabled:opacity-50`}
            title="测试LLM API连接"
          >
            {connectionStatus === "testing" ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400"></span>
                测试中
              </>
            ) : connectionStatus === "success" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
                已连接
              </>
            ) : connectionStatus === "failed" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                连接失败
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                测试连接
              </>
            )}
          </button>

          {isCompleted ? (
            <Link
              href={`/projects/${id}/results`}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              查看纪要
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              disabled={isTyping || isEnding}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              结束脑暴
            </button>
          )}
        </div>
      </header>

      {/* Chat stream */}
      <ChatStream
        messages={messages}
        isTyping={isTyping}
        typingRole={typingRole}
        searchStatus={searchStatus}
        onEditMessage={handleEditMessage}
        disabled={isTyping || isEnding}
      />

      {/* Error message with retry */}
      {error && (
        <div className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="shrink-0 rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      {isCompleted ? (
        <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-sm text-gray-500">
            <span>脑暴已结束</span>
            <Link
              href={`/projects/${id}/results`}
              className="font-medium text-blue-600 hover:text-blue-800"
            >
              查看会议纪要 →
            </Link>
          </div>
        </div>
      ) : (
        <>
          {isPaused && (
            <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-2">
              <div className="mx-auto max-w-3xl text-sm text-amber-800">
                讨论已暂停 — 剩余 {pauseRemainingTurns ?? "?"} 轮专家发言。你可补充偏好或信息，或直接继续。
              </div>
            </div>
          )}
          <InputBar
            onSend={handleSend}
            onSummarize={handleSummarize}
            onStop={handleStop}
            onContinue={handleContinue}
            isPaused={isPaused}
            disabled={isTyping || isEnding}
            placeholder="输入你的想法，按 Enter 发送..."
          />
        </>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 transform">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
            <p className="text-sm text-gray-700">{toast}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-gray-400 transition-colors hover:text-gray-600"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* End brainstorm confirm dialog */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              结束脑暴并生成纪要
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              结束后将自动生成会议纪要，之后无法继续对话。确定要结束吗？
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEndConfirm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleEnd}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                确认结束
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ending overlay - generating minutes */}
      {isEnding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex gap-1">
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]"></span>
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]"></span>
                <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-500"></span>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                正在生成会议纪要...
              </h2>
            </div>
            {endingProgress && (
              <div className="max-h-60 overflow-y-auto rounded-lg bg-gray-50 p-3">
                <pre className="whitespace-pre-wrap break-words text-xs text-gray-600">
                  {endingProgress}
                </pre>
              </div>
            )}
            <p className="mt-3 text-sm text-gray-500">
              生成完成后将自动跳转到纪要页面
            </p>
            <button
              type="button"
              onClick={handleStopEnd}
              className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              停止生成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
