/**
 * 文档管理器
 *
 * 从 brainstorm-engine.ts 提取的纪要/文档/思维导图生成逻辑。
 * 封装 Agent 调用 + 持久化操作。
 */

import { prisma } from "@/lib/prisma";
import type { LanguageModel } from "ai";
import type { HostAgent } from "./host-agent";
import type { DocumentAgent, DocumentType } from "./document-agent";
import type { MindmapAgent } from "./mindmap-agent";
import type { EngineCallbacks } from "./host-agent";
import { persistMessage, loadConversationHistory, buildContextString, getNextSeq } from "./conversation-manager";

/**
 * 文档管理器：封装纪要、文档草稿、思维导图的生成与持久化
 */
export class DocumentManager {
  constructor(
    private hostAgent: HostAgent,
    private documentAgent: DocumentAgent,
    private mindmapAgent: MindmapAgent,
    private model: LanguageModel
  ) {}

  /**
   * DEF-04: 生成阶段总结（手动触发）
   */
  async generateSummary(
    projectId: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("项目不存在");
    const expertIds = JSON.parse(project.expertIds) as string[];
    const history = await loadConversationHistory(projectId);
    const contextString = await buildContextString(history, projectId, undefined, this.model, await getNextSeq(projectId));
    const summary = await this.hostAgent.generateSummary(contextString, (chunk) => callbacks.onSummary?.(chunk), abortSignal, projectId);
    await persistMessage(projectId, "summary", summary, undefined, expertIds);
  }

  /**
   * DEF-04: 结束脑暴，生成会议纪要
   */
  async generateMinutes(
    projectId: string,
    projectTitle: string,
    contextString: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const minutes = await this.hostAgent.generateMinutes(
      projectTitle,
      contextString,
      (chunk) => callbacks.onMinutes?.(chunk),
      abortSignal,
      projectId
    );

    // 保存纪要
    await prisma.generatedDocument.create({
      data: {
        projectId,
        docType: "minutes",
        content: minutes,
      },
    });

    // 更新项目状态
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "completed",
        phase: "concluded",
        completedAt: new Date(),
      },
    });
  }

  /**
   * DEF-04: 生成会议纪要（含项目校验和上下文构建）
   */
  async generateMinutesWithSetup(
    projectId: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error("项目不存在");
    if (project.status !== "active") throw new Error("该项目已结束，无法重复生成纪要");
    const history = await loadConversationHistory(projectId);
    const contextString = await buildContextString(history, projectId, undefined, this.model, await getNextSeq(projectId));
    await this.generateMinutes(projectId, project.title, contextString, callbacks, abortSignal);
  }

  /**
   * 生成文档草稿（PRD/SPEC 等）
   */
  async generateDocument(
    projectId: string,
    docType: DocumentType,
    content: string,
    callbacks: EngineCallbacks,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const doc = await this.documentAgent.generate(docType, content, (chunk) => {
      callbacks.onDocument?.(chunk);
    }, abortSignal, projectId);

    // 保存文档
    await prisma.generatedDocument.create({
      data: {
        projectId,
        docType,
        content: doc,
      },
    });
  }

  /**
   * 生成思维导图：基于会议纪要流式输出 Markdown 格式的思维导图
   */
  async generateMindmap(
    projectId: string,
    callbacks: { onMindmap?: (chunk: string) => void; onError?: (message: string) => void },
    abortSignal?: AbortSignal
  ): Promise<void> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          where: { docType: "minutes" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!project) throw new Error("项目不存在");
    if (project.documents.length === 0) throw new Error("请先生成会议纪要");

    const minutesContent = project.documents[0].content;

    try {
      const mindmapMarkdown = await this.mindmapAgent.generateMindmap(
        minutesContent,
        (chunk) => callbacks.onMindmap?.(chunk),
        abortSignal,
        projectId
      );

      // 保存思维导图到 GeneratedDocument
      await prisma.generatedDocument.create({
        data: {
          projectId,
          docType: "mindmap",
          content: mindmapMarkdown,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "生成思维导图失败";
      callbacks.onError?.(message);
    }
  }
}
