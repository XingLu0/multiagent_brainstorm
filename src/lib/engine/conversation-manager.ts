/**
 * 对话管理器
 *
 * 从 brainstorm-engine.ts 提取的消息 CRUD + 上下文构建逻辑。
 * 所有函数均为服务端函数，直接依赖 prisma。
 */

import { prisma } from "@/lib/prisma";
import { getExpertById } from "@/lib/experts/definitions";
import { queryKnowledge, queryKnowledgeSemantic, getKnowledgeCounts } from "./knowledge-base";
import { MAX_CONTEXT_ROUNDS, CONTEXT_COMPRESS_THRESHOLD } from "./constants";
import { shouldCreateSnapshot, saveSnapshot } from "./snapshot-manager";
import { rebuildStateFromMessages, type ExpertState } from "./discussion-state";
import type { ExpertDefinition } from "@/lib/experts/types";
import { compressContext } from "./context-summarizer";
import type { LanguageModel, EmbeddingModel } from "ai";

/**
 * 对话消息（精简结构，用于上下文构建）
 */
export interface ConversationMessage {
  role: string;
  content: string;
}

/**
 * 用户上传的附件（前端解析后的文件内容）
 */
export interface MessageAttachment {
  name: string;
  type: string;
  text: string;
}

/**
 * 计算项目下一条消息的 seq 值
 * SQLite 不支持非主键 autoincrement，需手动计算
 */
export async function getNextSeq(projectId: string): Promise<number> {
  const result = await prisma.message.aggregate({
    where: { projectId },
    _max: { seq: true },
  });
  return (result._max.seq ?? 0) + 1;
}

/**
 * 持久化消息（统一入口，自动计算 seq）
 *
 * DEF-02 修复：当传入 snapshotExpertIds 且消息 seq 达到 SNAPSHOT_INTERVAL 倍数时，
 * 自动创建状态快照。快照创建失败不阻塞消息持久化。
 *
 * @param snapshotExpertIds 当前项目的专家 ID 列表（用于触发快照创建）
 * @returns 创建的消息记录
 */
export async function persistMessage(
  projectId: string,
  role: string,
  content: string,
  metadata?: string,
  snapshotExpertIds?: string[]
) {
  const message = await prisma.message.create({
    data: {
      projectId,
      role,
      content,
      metadata,
      seq: await getNextSeq(projectId),
    },
  });

  // DEF-02: 检查是否需要创建快照
  if (snapshotExpertIds && snapshotExpertIds.length > 0 && shouldCreateSnapshot(message.seq)) {
    try {
      const allMessages = await loadConversationHistory(projectId);
      const experts = await Promise.all(
        snapshotExpertIds.map(async (id) => {
          const expert = await getExpertById(id);
          return { id, name: expert?.name ?? id, avatarColor: expert?.avatarColor ?? "emerald" };
        })
      );
      const knowledgeCounts = await getKnowledgeCounts(projectId);
      const state = rebuildStateFromMessages(
        allMessages.map(m => ({ role: m.role, content: m.content })),
        experts as ExpertDefinition[],
        knowledgeCounts
      );
      await saveSnapshot(projectId, message.seq, state);
    } catch {
      // 快照创建失败不影响消息持久化
    }
  }

  return message;
}

/**
 * 持久化消息并在快照点自动创建状态快照
 *
 * @deprecated 已合并到 persistMessage，请直接使用 persistMessage 并传入 snapshotExpertIds
 */
export async function persistMessageWithSnapshot(
  projectId: string,
  role: string,
  content: string,
  metadata: string | undefined,
  experts: { id: string; name: string; avatarColor: string }[],
  _knowledgeCounts: { consensus: number; divergence: number }
): Promise<void> {
  await persistMessage(projectId, role, content, metadata, experts.map(e => e.id));
}

/**
 * 加载对话历史（按 seq 排序，保证严格顺序）
 */
export async function loadConversationHistory(
  projectId: string
): Promise<ConversationMessage[]> {
  const messages = await prisma.message.findMany({
    where: { projectId },
    orderBy: { seq: "asc" },
  });

  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * 读取并消费未使用的用户干预指令
 *
 * 扫描项目中所有 role=user 的消息，解析 metadata，筛选出
 * type="intervene" 且尚未被消费（consumed !== true）的干预指令。
 * 读取后立即将其 metadata 标记为 consumed=true（持久化），
 * 确保每条干预指令仅在一个专家讨论轮次中被强调注入。
 *
 * @returns 未消费的干预指令原文列表（按 seq 升序）
 */
export async function consumeUnconsumedInterventions(
  projectId: string
): Promise<string[]> {
  const messages = await prisma.message.findMany({
    where: { projectId, role: "user" },
    orderBy: { seq: "asc" },
    select: { id: true, content: true, metadata: true },
  });

  const directives: string[] = [];
  const toMark: { id: string; metadata: string }[] = [];

  for (const m of messages) {
    if (!m.metadata) continue;
    try {
      const meta = JSON.parse(m.metadata) as {
        type?: string;
        consumed?: boolean;
      };
      if (meta.type === "intervene" && meta.consumed !== true) {
        directives.push(m.content);
        toMark.push({
          id: m.id,
          metadata: JSON.stringify({ ...meta, consumed: true }),
        });
      }
    } catch {
      // 元数据解析失败，跳过该条消息
    }
  }

  // 标记为已消费，避免重复强调
  for (const item of toMark) {
    await prisma.message.update({
      where: { id: item.id },
      data: { metadata: item.metadata },
    });
  }

  return directives;
}

/**
 * 获取角色显示名称
 */
export async function getRoleLabel(role: string): Promise<string> {
  if (role === "user") return "用户";
  if (role === "host") return "主持人";
  if (role === "summary") return "阶段总结";
  if (role === "pause") return "中场总结";
  if (role.startsWith("expert:")) {
    const expertId = role.slice(7);
    const expert = await getExpertById(expertId);
    return expert?.name ?? "专家";
  }
  return role;
}

/**
 * 构建上下文字符串（含共享知识库摘要 + 附件资料）
 *
 * P0-4: 当 history.length > CONTEXT_COMPRESS_THRESHOLD 且传入 model 时，
 * 对旧消息生成 LLM 摘要，保留最近 CONTEXT_RECENT_KEEP 条完整消息。
 *
 * @param history 对话历史
 * @param projectId 项目 ID（用于查询知识库 + 摘要缓存），可选
 * @param attachments 当前用户消息携带的附件，注入为"附件资料"段落供专家引用
 * @param model LLM 模型（传入才启用压缩），可选
 * @param lastSeq 最新消息的 seq（用于摘要缓存判断），可选
 */
export async function buildContextString(
  history: ConversationMessage[],
  projectId?: string,
  attachments?: MessageAttachment[],
  model?: LanguageModel,
  lastSeq?: number,
  queryText?: string,
  embeddingModel?: EmbeddingModel
): Promise<string> {
  const lines: string[] = [];

  // P0-4: 上下文压缩
  let useCompression = false;
  let compressedSummary = "";
  let recentMessages = history.slice(-MAX_CONTEXT_ROUNDS * 3);

  if (model && projectId && lastSeq && history.length > CONTEXT_COMPRESS_THRESHOLD) {
    try {
      const result = await compressContext(history, projectId, model, lastSeq);
      if (result) {
        useCompression = true;
        compressedSummary = result.summary;
        recentMessages = result.recentMessages;
      }
    } catch {
      // 压缩失败，降级为原始逻辑
    }
  }

  // 历史摘要段落（仅压缩模式且摘要非空时输出）
  if (useCompression && compressedSummary) {
    lines.push(`[历史摘要]\n${compressedSummary}`);
  }

  // 最近对话段落
  if (useCompression) {
    lines.push("[最近对话]");
  }
  for (const m of recentMessages) {
    const roleLabel = await getRoleLabel(m.role);
    lines.push(`[${roleLabel}]：${m.content}`);
  }

  // 注入附件资料（拼装为独立段落，供主持人/专家引用）
  if (attachments && attachments.length > 0) {
    const attachmentLines = attachments.map(
      (a) => `--- 附件：${a.name} ---\n${a.text}`
    );
    lines.push(`\n【附件资料】\n${attachmentLines.join("\n\n")}`);
  }

  // 注入共享知识库摘要
  if (projectId) {
    let knowledgeSummary: string;
    if (queryText && embeddingModel) {
      // P2-2: 语义检索 top-K 相关知识
      knowledgeSummary = await queryKnowledgeSemantic(projectId, queryText, embeddingModel);
    } else {
      knowledgeSummary = await queryKnowledge(projectId);
    }
    if (knowledgeSummary) {
      lines.push(`\n【共享知识库】\n${knowledgeSummary}`);
    }
  }

  return lines.join("\n\n");
}
