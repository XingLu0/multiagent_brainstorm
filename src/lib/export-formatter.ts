/**
 * 讨论历史导出格式化器
 * 支持 JSON、Markdown、Text 三种格式
 */

export interface ExportData {
  project: {
    id: string;
    title: string;
    status: string;
    phase: string;
    expertIds: string;
    createdAt: Date;
    completedAt: Date | null;
  };
  messages: {
    id: string;
    role: string;
    content: string;
    metadata: string | null;
    seq: number;
    createdAt: Date;
  }[];
  documents: {
    id: string;
    docType: string;
    content: string;
    createdAt: Date;
  }[];
}

/** 解析角色名称，将 expert:xxx 转为更友好的显示 */
function formatRole(role: string): string {
  if (role.startsWith("expert:")) {
    return `专家 ${role.slice(7)}`;
  }
  const roleMap: Record<string, string> = {
    host: "主持人",
    user: "用户",
    summary: "阶段总结",
    pause: "中场总结",
    system: "系统通知",
    minutes: "会议纪要",
  };
  return roleMap[role] ?? role;
}

/** 格式化日期为易读字符串 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" });
}

/** 解析专家 ID 从角色字符串 */
function parseExpertId(role: string): string | undefined {
  if (role.startsWith("expert:")) {
    return role.slice(7);
  }
  return undefined;
}

/** 导出为 JSON 格式 */
export function exportAsJSON(data: ExportData): string {
  // 按 seq 排序消息
  const sortedMessages = [...data.messages].sort((a, b) => a.seq - b.seq);
  return JSON.stringify(
    {
      project: {
        title: data.project.title,
        status: data.project.status,
        phase: data.project.phase,
        expertIds: JSON.parse(data.project.expertIds),
        createdAt: data.project.createdAt,
        completedAt: data.project.completedAt,
      },
      messages: sortedMessages.map((m) => ({
        seq: m.seq,
        role: m.role,
        expertId: parseExpertId(m.role),
        content: m.content,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        createdAt: m.createdAt,
      })),
      documents: data.documents.map((d) => ({
        type: d.docType,
        content: d.content,
        createdAt: d.createdAt,
      })),
    },
    null,
    2
  );
}

/** 导出为 Markdown 格式 */
export function exportAsMarkdown(data: ExportData): string {
  const lines: string[] = [];

  // 标题
  lines.push(`# ${data.project.title}`);
  lines.push("");

  // 元信息表格
  lines.push("## 讨论信息");
  lines.push("");
  lines.push(`| 属性 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 状态 | ${data.project.status} |`);
  lines.push(`| 阶段 | ${data.project.phase} |`);
  lines.push(`| 创建时间 | ${formatDate(data.project.createdAt)} |`);
  if (data.project.completedAt) {
    lines.push(`| 完成时间 | ${formatDate(data.project.completedAt)} |`);
  }
  const expertIds = JSON.parse(data.project.expertIds) as string[];
  lines.push(`| 参与专家 | ${expertIds.join(", ")} |`);
  lines.push("");

  // 讨论记录
  if (data.messages.length > 0) {
    lines.push("## 讨论记录");
    lines.push("");
    // 按 seq 排序消息
    const sortedMessages = [...data.messages].sort((a, b) => a.seq - b.seq);
    for (const msg of sortedMessages) {
      const roleLabel = formatRole(msg.role);
      const time = formatDate(msg.createdAt);
      lines.push(`### [${roleLabel}] (${time})`);
      lines.push("");
      lines.push(msg.content);
      lines.push("");

      // 解析 metadata 中的额外信息
      if (msg.metadata) {
        try {
          const meta = JSON.parse(msg.metadata);
          if (meta.type === "pause") {
            lines.push(`> 暂停 — 已完成 ${meta.completedTurns}/${meta.totalTurns} 轮`);
            lines.push("");
          }
        } catch {
          // 忽略解析失败
        }
      }
    }
  }

  // 生成文档
  if (data.documents.length > 0) {
    lines.push("## 生成文档");
    lines.push("");
    const docTypeMap: Record<string, string> = {
      minutes: "会议纪要",
      document: "专业文档",
      mindmap: "思维导图",
    };
    for (const doc of data.documents) {
      const typeLabel = docTypeMap[doc.docType] ?? doc.docType;
      lines.push(`### ${typeLabel}`);
      lines.push(`*生成时间：${formatDate(doc.createdAt)}*`);
      lines.push("");
      lines.push(doc.content);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** 导出为纯文本格式 */
export function exportAsText(data: ExportData): string {
  const lines: string[] = [];

  lines.push(`讨论标题：${data.project.title}`);
  lines.push(`状态：${data.project.status} | 阶段：${data.project.phase}`);
  lines.push(`创建时间：${formatDate(data.project.createdAt)}`);
  if (data.project.completedAt) {
    lines.push(`完成时间：${formatDate(data.project.completedAt)}`);
  }
  lines.push("=".repeat(60));
  lines.push("");

  // 按 seq 排序消息
  const sortedMessages = [...data.messages].sort((a, b) => a.seq - b.seq);
  for (const msg of sortedMessages) {
    const roleLabel = formatRole(msg.role);
    const time = formatDate(msg.createdAt);
    lines.push(`[${roleLabel}] ${time}`);
    lines.push("-".repeat(40));
    lines.push(msg.content);
    lines.push("");
  }

  if (data.documents.length > 0) {
    lines.push("=".repeat(60));
    lines.push("生成文档：");
    lines.push("");
    const docTypeMap: Record<string, string> = {
      minutes: "会议纪要",
      document: "专业文档",
      mindmap: "思维导图",
    };
    for (const doc of data.documents) {
      const typeLabel = docTypeMap[doc.docType] ?? doc.docType;
      lines.push(`--- ${typeLabel} ---`);
      lines.push(doc.content);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** 文件名清理：移除不安全的文件系统字符 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 100) || "discussion";
}
