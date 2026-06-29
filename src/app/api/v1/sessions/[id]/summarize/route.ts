import { createSSEResponse } from "@/lib/sse";
import { createEngineFromRequest } from "@/lib/server-config";

/**
 * POST /api/v1/sessions/[id]/summarize
 * 手动请求阶段总结，返回 SSE 流
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return createSSEResponse(async (send) => {
    const engine = createEngineFromRequest(request);
    await engine.generateSummary(id, {
      onSummary: (content) => {
        send("summary", { content });
      },
    }, request.signal);
  });
}
