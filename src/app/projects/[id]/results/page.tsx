import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MarkdownViewer } from "@/components/results/markdown-viewer";
import { DocGenerator } from "@/components/results/doc-generator";
import { MindmapView } from "@/components/results/mindmap-view";
import { DOC_TYPE_LABELS } from "@/lib/engine/document-agent";
import type { DocumentType } from "@/lib/engine/document-agent";

export const dynamic = "force-dynamic";

interface ResultsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const minutesDocs = project.documents.filter((d) => d.docType === "minutes");
  const minutes = minutesDocs.length > 0
    ? minutesDocs.reduce((a, b) => (a.content.length >= b.content.length ? a : b))
    : undefined;
  const generatedDocs = project.documents.filter(
    (d) => d.docType !== "minutes" && d.docType !== "mindmap"
  );

  return (
    <main className="min-h-full flex-1 bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/projects/${id}`}
            className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            返回脑暴
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {project.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            脑暴纪要与文档生成
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left/main area: Minutes markdown */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">会议纪要</h2>
              {minutes && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  已生成
                </span>
              )}
            </div>

            {minutes ? (
              <MarkdownViewer content={minutes.content} copyLabel="复制纪要" />
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center">
                <p className="text-sm text-gray-500">
                  暂无会议纪要
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  请先在脑暴页面结束脑暴以生成纪要
                </p>
                <Link
                  href={`/projects/${id}`}
                  className="mt-3 inline-block rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
                >
                  前往脑暴
                </Link>
              </div>
            )}

            {/* Previously generated documents */}
            {generatedDocs.length > 0 && (
              <div className="space-y-3 pt-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  历史生成文档
                </h3>
                {generatedDocs.map((doc) => (
                  <div key={doc.id} className="space-y-1">
                    <span className="text-xs font-medium text-gray-500">
                      {DOC_TYPE_LABELS[doc.docType as DocumentType] ?? doc.docType} -{" "}
                      {new Date(doc.createdAt).toLocaleString("zh-CN")}
                    </span>
                    <MarkdownViewer content={doc.content} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right/bottom area: Paste area + document generation */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">生成文档</h2>
            <p className="text-sm text-gray-500">
              复制左侧纪要内容，修改后粘贴到下方，选择文档类型生成草稿。
            </p>
            <DocGenerator
              projectId={id}
              initialContent={minutes?.content ?? ""}
            />
          </div>
        </div>

        {/* 思维导图区域 */}
        <div className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">思维导图</h2>
          <MindmapView projectId={id} minutesContent={minutes?.content ?? ""} />
        </div>
      </div>
    </main>
  );
}
