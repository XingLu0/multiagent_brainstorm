import { prisma } from "@/lib/prisma";
import {
  exportAsJSON,
  exportAsMarkdown,
  exportAsText,
  sanitizeFilename,
  type ExportData,
} from "@/lib/export-formatter";

/**
 * GET /api/v1/sessions/[id]/export?format=json|markdown|text
 * 导出讨论历史为文件下载
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(_request.url);
  const format = (url.searchParams.get("format") ?? "markdown").toLowerCase();

  // 查询项目数据
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { seq: "asc" } },
      documents: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!project) {
    return new Response(JSON.stringify({ error: "项目不存在" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 构造导出数据
  const exportData: ExportData = {
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      phase: project.phase,
      expertIds: project.expertIds,
      createdAt: project.createdAt,
      completedAt: project.completedAt,
    },
    messages: project.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      metadata: m.metadata,
      seq: m.seq,
      createdAt: m.createdAt,
    })),
    documents: project.documents.map((d) => ({
      id: d.id,
      docType: d.docType,
      content: d.content,
      createdAt: d.createdAt,
    })),
  };

  // 根据格式生成内容
  let content: string;
  let contentType: string;
  let fileExt: string;

  switch (format) {
    case "json":
      content = exportAsJSON(exportData);
      contentType = "application/json";
      fileExt = "json";
      break;
    case "text":
    case "txt":
      content = exportAsText(exportData);
      contentType = "text/plain; charset=utf-8";
      fileExt = "txt";
      break;
    case "markdown":
    case "md":
      content = exportAsMarkdown(exportData);
      contentType = "text/markdown; charset=utf-8";
      fileExt = "md";
      break;
    default:
      content = exportAsMarkdown(exportData);
      contentType = "text/markdown; charset=utf-8";
      fileExt = "md";
      break;
  }

  const filename = `${sanitizeFilename(project.title)}.${fileExt}`;

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-cache",
    },
  });
}
