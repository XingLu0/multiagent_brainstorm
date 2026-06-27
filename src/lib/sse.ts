export type SSEEventType =
  | "host"
  | "expert"
  | "expert_start"
  | "summary"
  | "minutes"
  | "document"
  | "mindmap"
  | "error"
  | "done"
  | "ping"
  | "tool_call"
  | "pause";

export type SSESendFn = (event: SSEEventType, data: Record<string, unknown>) => void;

export interface SSEHandler {
  (send: SSESendFn): Promise<void>;
}

export function createSSEResponse(handler: SSEHandler): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send: SSESendFn = (event, data) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      try {
        await handler(send);
        send("done", {});
      } catch (e) {
        const message = e instanceof Error ? e.message : "处理失败";
        send("error", { message, retryable: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function parseSSEStream(
  response: Response,
  handlers: {
    onHost?: (data: { content: string; expertIds?: string[] }) => void;
    onExpert?: (data: { content: string; expertId: string; round?: number }) => void;
    onExpertStart?: (data: { expertId: string; round: number }) => void;
    onSummary?: (data: { content: string }) => void;
    onMinutes?: (data: { content: string }) => void;
    onDocument?: (data: { content: string }) => void;
    onMindmap?: (data: { content: string }) => void;
    onError?: (data: { message: string; retryable: boolean }) => void;
    onDone?: (data: Record<string, unknown>) => void;
    onToolCall?: (data: { expertId: string | null; toolName: string; input: unknown }) => void;
    onPause?: (data: { content: string; remainingTurns?: number }) => void;
  }
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        switch (currentEvent) {
          case "host":
            handlers.onHost?.(data);
            break;
          case "expert":
            handlers.onExpert?.(data);
            break;
          case "expert_start":
            handlers.onExpertStart?.(data);
            break;
          case "summary":
            handlers.onSummary?.(data);
            break;
          case "minutes":
            handlers.onMinutes?.(data);
            break;
          case "document":
            handlers.onDocument?.(data);
            break;
          case "mindmap":
            handlers.onMindmap?.(data);
            break;
          case "error":
            handlers.onError?.(data);
            break;
          case "tool_call":
            handlers.onToolCall?.(data);
            break;
          case "pause":
            handlers.onPause?.(data);
            break;
          case "done":
            handlers.onDone?.(data);
            break;
        }
        currentEvent = "";
      }
    }
  }
}
