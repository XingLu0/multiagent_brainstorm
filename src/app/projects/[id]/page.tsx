"use client";

import React, { useState, useEffect, useCallback, useRef, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChatStream, type ChatMessage } from "@/components/chat/chat-stream";
import { InputBar, type Attachment } from "@/components/chat/input-bar";
import { DiscussionDashboard } from "@/components/dashboard/discussion-dashboard";
import { ExpertPicker } from "@/components/project/expert-picker";
import { parseSSEStream } from "@/lib/sse";
import { fetchWithConfig } from "@/lib/client-config";
import { getExpertColors } from "@/lib/experts/colors";
import {
  createInitialState,
  rebuildStateFromMessages,
  MAX_EXPERT_ROUNDS,
  type DiscussionState,
} from "@/lib/engine/discussion-state";
import { useExperts } from "@/lib/hooks/use-experts";

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
    phase: string;
    knowledgeCounts: { consensus: number; divergence: number };
    expertIds: string[];
  } | null>(null);
  const [dashboardState, setDashboardState] = useState<DiscussionState>(() =>
    createInitialState([])
  );
  const { experts } = useExperts();
  // 缓存从 API 加载的原始消息，供看板重建使用（避免依赖流式中的 messages state）
  const apiMessagesRef = useRef<{ role: string; content: string; metadata?: string | null }[]>([]);
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
  // 动态专家管理：邀请/移除专家模态框与主持人建议专家
  const [showExpertPicker, setShowExpertPicker] = useState(false);
  const [suggestedExpert, setSuggestedExpert] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const endAbortRef = useRef<AbortController | null>(null);

  // 当前项目参与的专家（按 project.expertIds 过滤）
  const projectExperts = useMemo(
    () => experts.filter((e) => project?.expertIds.includes(e.id) ?? false),
    [experts, project?.expertIds]
  );

  // 将当前发言中的专家标记为已完成，并切换 phase（用于流式结束/暂停时的收尾）
  const finalizeDashboard = useCallback(
    (nextPhase: DiscussionState["phase"]) => {
      setDashboardState((prev) => {
        if (nextPhase === "completed" && prev.phase === "completed") return prev;
        const hasSpeaking = prev.activeExperts.some((e) => e.speaking);
        return {
          ...prev,
          phase: nextPhase,
          completedTurns: hasSpeaking
            ? prev.completedTurns + 1
            : prev.completedTurns,
          activeExperts: prev.activeExperts.map((e) =>
            e.speaking ? { ...e, speaking: false, spoken: true } : e
          ),
        };
      });
    },
    []
  );

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

        // 解析项目专家 id 列表与知识库计数
        let expertIds: string[] = [];
        try {
          expertIds = Array.isArray(projectData.expertIds)
            ? projectData.expertIds
            : JSON.parse(projectData.expertIds ?? "[]");
        } catch {
          expertIds = [];
        }
        const knowledgeCounts = projectData.knowledgeCounts ?? {
          consensus: 0,
          divergence: 0,
        };
        setProject({
          title: projectData.title,
          status: projectData.status,
          phase: projectData.phase ?? "diverge",
          knowledgeCounts,
          expertIds,
        });

        // 缓存原始消息供看板重建
        apiMessagesRef.current = (projectData.messages ?? []).map(
          (m: ApiMessage) => ({
            role: m.role,
            content: m.content,
            metadata: m.metadata,
          })
        );

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

        // 用当前可用的专家列表重建看板初始状态（自定义专家加载后会由下方 useEffect 再次重建）
        const initialExperts = experts.filter((e) => expertIds.includes(e.id));
        setDashboardState(
          rebuildStateFromMessages(
            apiMessagesRef.current,
            initialExperts,
            knowledgeCounts,
            projectData.status === "completed"
          )
        );
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "加载数据失败");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 当项目数据或专家列表变化时重建看板；流式进行中（hosting/discussing/summarizing）保留实时状态。
  // 已结束项目（status === "completed"）通过 rebuildStateFromMessages 的 isCompleted 参数置为 completed 阶段。
  useEffect(() => {
    if (!project) return;
    setDashboardState((prev) => {
      if (
        prev.phase === "hosting" ||
        prev.phase === "discussing" ||
        prev.phase === "summarizing"
      ) {
        return prev;
      }
      return rebuildStateFromMessages(
        apiMessagesRef.current,
        projectExperts,
        project.knowledgeCounts,
        project.status === "completed"
      );
    });
  }, [projectExperts, project]);

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
        const raw = data.messages as ApiMessage[];
        apiMessagesRef.current = raw.map((m) => ({
          role: m.role,
          content: m.content,
          metadata: m.metadata,
        }));
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
        // 解析主持人输出中的 [SUGGEST_EXPERT:领域描述] 标记，提示用户邀请专家
        const suggestMatch = data.content.match(/\[SUGGEST_EXPERT:([^\]]+)\]/);
        if (suggestMatch) {
          setSuggestedExpert(suggestMatch[1].trim());
        }
        // 进入主持人引导阶段，重置本轮看板进度与活跃专家
        const ids = data.expertIds ?? [];
        setDashboardState((prev) => ({
          ...prev,
          phase: "hosting",
          currentRound: 0,
          completedTurns: 0,
          totalTurns: ids.length > 0 ? MAX_EXPERT_ROUNDS * ids.length : prev.totalTurns,
          activeExperts: ids.map((eid) => {
            const def = projectExperts.find((e) => e.id === eid);
            return {
              id: eid,
              name: def?.name ?? eid,
              avatarColor: def?.avatarColor ?? "emerald",
              spoken: false,
              speaking: false,
            };
          }),
        }));
      },
      onExpertStart: (data: { expertId: string; round: number }) => {
        setTypingRole({ role: "expert", expertId: data.expertId, round: data.round });
        // 进入专家讨论阶段，收尾上一位发言专家并切换当前发言者
        setDashboardState((prev) => {
          let { completedTurns, activeExperts } = prev;
          const currentRound = prev.currentRound;
          const hadSpeaking = activeExperts.some((e) => e.speaking);
          if (hadSpeaking) {
            completedTurns += 1;
            activeExperts = activeExperts.map((e) =>
              e.speaking ? { ...e, speaking: false, spoken: true } : e
            );
          }
          const newRound = data.round ?? currentRound;
          // 轮次递增：新轮次重置该轮发言标记
          if (newRound > currentRound) {
            activeExperts = activeExperts.map((e) => ({
              ...e,
              spoken: false,
              speaking: false,
            }));
          }
          activeExperts = activeExperts.map((e) =>
            e.id === data.expertId ? { ...e, speaking: true } : e
          );
          return {
            ...prev,
            phase: "discussing",
            currentRound: newRound,
            completedTurns,
            activeExperts,
          };
        });
      },
      onExpert: (data: { content: string; expertId: string; round?: number }) => {
        setSearchStatus(null);
        setTypingRole({ role: "expert", expertId: data.expertId, round: data.round });
        handleStreamChunk("expert", data.content, data.expertId, data.round);
        // 标记当前专家已开始发言
        setDashboardState((prev) => ({
          ...prev,
          phase: "discussing",
          currentRound: data.round ?? prev.currentRound,
          activeExperts: prev.activeExperts.map((e) =>
            e.id === data.expertId ? { ...e, spoken: true, speaking: true } : e
          ),
        }));
      },
      onSummary: (data: { content: string }) => {
        setTypingRole({ role: "summary" });
        handleStreamChunk("summary", data.content);
        // 进入总结阶段，收尾当前发言专家
        finalizeDashboard("summarizing");
      },
      onPause: (data: { content: string; remainingTurns?: number }) => {
        setTypingRole({ role: "pause" });
        handleStreamChunk("pause", data.content);
        pausedRef.current = true;
        setPauseRemainingTurns(data.remainingTurns);
        // 进入暂停阶段，收尾当前发言专家并更新总轮次
        setDashboardState((prev) => {
          const hasSpeaking = prev.activeExperts.some((e) => e.speaking);
          const completedTurns = hasSpeaking
            ? prev.completedTurns + 1
            : prev.completedTurns;
          const totalTurns =
            typeof data.remainingTurns === "number"
              ? completedTurns + data.remainingTurns
              : prev.totalTurns;
          return {
            ...prev,
            phase: "paused",
            completedTurns,
            totalTurns,
            activeExperts: prev.activeExperts.map((e) =>
              e.speaking ? { ...e, speaking: false, spoken: true } : e
            ),
          };
        });
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
    [handleStreamChunk, reloadMessagesFromDB, projectExperts, finalizeDashboard]
  );

  // Send a message via SSE（支持附带附件）
  const sendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
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
          body: JSON.stringify({ content, attachments }),
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
        // 流式结束：非暂停态恢复 idle，收尾当前发言专家
        if (!pausedRef.current) finalizeDashboard("idle");
      }
    },
    [id, createStreamHandlers, reloadMessagesFromDB, finalizeDashboard]
  );

  const handleSend = useCallback(
    (text: string, attachments?: Attachment[]) => {
      sendMessage(text, attachments);
    },
    [sendMessage]
  );

  // 发送用户干预指令：以 / 开头的方向性干预，仅持久化为 intervene 类型消息，
  // 不触发专家即时回应；指令将在下一轮专家讨论时注入【用户干预指令】段落。
  const handleIntervene = useCallback(
    async (directive: string) => {
      // 前端立即追加用户消息气泡（与后端持久化保持一致）
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "user", content: directive },
      ]);
      setError(null);

      try {
        const response = await fetchWithConfig(
          `/api/sessions/${id}/intervene`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ directive }),
          }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error ?? `请求失败 (${response.status})`);
        }

        // 持久化成功后从 DB 同步，确保 metadata（intervene 标记）等字段正确
        await reloadMessagesFromDB();
        setToast("干预指令已记录，将在下一轮讨论中引导专家方向");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "干预指令发送失败";
        setError(msg);
        setToast(`干预失败: ${msg}`);
        await reloadMessagesFromDB();
      }
    },
    [id, reloadMessagesFromDB]
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
        if (!pausedRef.current) finalizeDashboard("idle");
      }
    },
    [id, createStreamHandlers, reloadMessagesFromDB, finalizeDashboard]
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
          const raw = data.messages as ApiMessage[];
          apiMessagesRef.current = raw.map((m) => ({
            role: m.role,
            content: m.content,
            metadata: m.metadata,
          }));
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
      if (!pausedRef.current) finalizeDashboard("idle");
    }
  }, [id, lastMessage, messages, sendMessage, createStreamHandlers, reloadMessagesFromDB, finalizeDashboard]);

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
        if (!pausedRef.current) finalizeDashboard("idle");
      }
    },
    [id, messages, createStreamHandlers, reloadMessagesFromDB, finalizeDashboard]
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
        onSummary: (data) => {
          handleStreamChunk("summary", data.content);
          setDashboardState((prev) => ({ ...prev, phase: "summarizing" }));
        },
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
      finalizeDashboard("idle");
    }
  }, [id, handleStreamChunk, finalizeDashboard]);

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

  // 进入收敛阶段：将讨论从发散切换到收敛
  const handleEnterConverge = useCallback(async () => {
    if (!project || isTyping) return;
    try {
      const res = await fetchWithConfig(`/api/sessions/${id}/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "converge" }),
      });
      if (res.ok) {
        setProject((prev) => (prev ? { ...prev, phase: "converge" } : prev));
        setToast("已进入收敛阶段");
        await reloadMessagesFromDB();
      } else {
        const err = await res.json().catch(() => ({}));
        setToast(`操作失败: ${err.error ?? "未知错误"}`);
      }
    } catch (e) {
      setToast(`操作失败: ${e instanceof Error ? e.message : "未知错误"}`);
    }
  }, [project, isTyping, id, reloadMessagesFromDB]);

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
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-gray-900">
                {project?.title ?? "脑暴"}
              </h1>
              {project?.phase && project.phase !== "concluded" && !isCompleted && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    project.phase === "converge"
                      ? "bg-blue-50 text-blue-600"
                      : "bg-orange-50 text-orange-600"
                  }`}
                >
                  {project.phase === "converge" ? "收敛" : "发散"}
                </span>
              )}
            </div>
            {isCompleted && (
              <span className="text-xs text-gray-500">脑暴已结束</span>
            )}
          </div>
        </div>

        {/* 专家头像展示区 + 邀请按钮 */}
        <div className="flex items-center gap-1.5">
          {project?.expertIds?.map((eid) => {
            const expert = experts.find((e) => e.id === eid);
            if (!expert) return null;
            const colors = getExpertColors(expert.avatarColor);
            return (
              <div
                key={eid}
                className={`flex h-7 w-7 items-center justify-center rounded-full ${colors.avatar} text-xs font-semibold text-white`}
                style={colors.style}
                title={expert.name}
              >
                {expert.name.charAt(0)}
              </div>
            );
          })}
          {!isCompleted && project && (
            <button
              type="button"
              onClick={() => setShowExpertPicker(true)}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-gray-300 text-gray-400 transition-colors hover:border-blue-400 hover:text-blue-500"
              title="邀请/管理专家"
            >
              +
            </button>
          )}
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
            <>
              {project?.phase === "diverge" && (
                <button
                  type="button"
                  onClick={handleEnterConverge}
                  disabled={isTyping || isEnding}
                  className="rounded-lg border border-orange-300 px-3 py-1.5 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  进入收敛
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowEndConfirm(true)}
                disabled={isTyping || isEnding}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                结束脑暴
              </button>
            </>
          )}
        </div>
      </header>

      {/* 主持人建议邀请专家提示条 */}
      {suggestedExpert && !isCompleted && (
        <div className="shrink-0 border-t border-blue-200 bg-blue-50 px-4 py-2">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 text-sm text-blue-800">
            <span>建议邀请「{suggestedExpert}」领域的专家参与讨论</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowExpertPicker(true);
                  setSuggestedExpert(null);
                }}
                className="rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600"
              >
                邀请专家
              </button>
              <button
                type="button"
                onClick={() => setSuggestedExpert(null)}
                className="text-blue-400 transition-colors hover:text-blue-600"
              >
                忽略
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 讨论状态看板 */}
      <DiscussionDashboard state={dashboardState} />

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
            onIntervene={handleIntervene}
            isPaused={isPaused}
            disabled={isTyping || isEnding}
            placeholder="输入你的想法，按 Enter 发送...（输入 / 可干预讨论方向）"
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

      {/* 动态专家管理模态框：邀请/移除专家 */}
      {showExpertPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              邀请 / 管理专家
            </h2>
            <p className="mb-3 text-xs text-gray-500">
              勾选或取消勾选专家以邀请加入或移出当前讨论。仅前 3 轮允许变更，每轮最多一次。
            </p>
            <ExpertPicker
              selectedIds={project?.expertIds ?? []}
              onChange={async (ids) => {
                // 找出新增的专家
                const newId = ids.find(
                  (id) => !project?.expertIds?.includes(id)
                );
                // 找出移除的专家
                const removedId = project?.expertIds?.find(
                  (id) => !ids.includes(id)
                );

                if (newId) {
                  try {
                    const res = await fetchWithConfig(
                      `/api/sessions/${id}/experts`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "add",
                          expertId: newId,
                        }),
                      }
                    );
                    if (res.ok) {
                      const data = await res.json();
                      setProject((prev) =>
                        prev
                          ? { ...prev, expertIds: data.expertIds }
                          : prev
                      );
                      setToast("已邀请专家加入讨论");
                      setShowExpertPicker(false);
                      await reloadMessagesFromDB();
                    } else {
                      const err = await res.json().catch(() => ({}));
                      setToast(`邀请失败: ${err.error ?? "未知错误"}`);
                    }
                  } catch (e) {
                    setToast(
                      `邀请失败: ${e instanceof Error ? e.message : "未知错误"}`
                    );
                  }
                } else if (removedId) {
                  try {
                    const res = await fetchWithConfig(
                      `/api/sessions/${id}/experts`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "remove",
                          expertId: removedId,
                        }),
                      }
                    );
                    if (res.ok) {
                      const data = await res.json();
                      setProject((prev) =>
                        prev
                          ? { ...prev, expertIds: data.expertIds }
                          : prev
                      );
                      setToast("已移除专家");
                      setShowExpertPicker(false);
                      await reloadMessagesFromDB();
                    } else {
                      const err = await res.json().catch(() => ({}));
                      setToast(`移除失败: ${err.error ?? "未知错误"}`);
                    }
                  } catch (e) {
                    setToast(
                      `移除失败: ${e instanceof Error ? e.message : "未知错误"}`
                    );
                  }
                }
              }}
            />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExpertPicker(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
