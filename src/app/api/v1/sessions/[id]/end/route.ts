import { createSSEResponse } from "@/lib/sse";
import { createEngineFromRequest } from "@/lib/server-config";

/**
 * POST /api/v1/sessions/[id]/end
 * 结束会话并生成会议纪要，返回 SSE 流
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return createSSEResponse(async (send) => {
    const engine = createEngineFromRequest(request);
    await engine.generateMinutes(id, {
      onMinutes: (content) => {
        send("minutes", { content });
      },
    }, request.signal);
  });
}
