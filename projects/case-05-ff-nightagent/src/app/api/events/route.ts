import { NextRequest } from "next/server";
import { mockEventStream } from "@/lib/events/mock-script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint —— 客户端通过 EventSource(`/api/events?goalId=xxx`) 订阅。
 * 无 ANTHROPIC_API_KEY 时走 mock 脚本；有 key 时可切换到 child_process runner（TODO）。
 */
export async function GET(req: NextRequest) {
  const goalId = req.nextUrl.searchParams.get("goalId") ?? "growth-plan-q2";
  const abort = new AbortController();

  // 监听 client 断开
  req.signal.addEventListener("abort", () => abort.abort());

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 初始 hello
      controller.enqueue(
        encoder.encode(
          `: connected\n\ndata: ${JSON.stringify({
            type: "heartbeat",
            content: "ready",
            time: new Date().toTimeString().slice(0, 8),
            goalId,
            id: "init",
          })}\n\n`
        )
      );

      try {
        for await (const ev of mockEventStream(goalId, abort.signal)) {
          if (abort.signal.aborted) break;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(ev)}\n\n`)
          );
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("[sse] stream error", err);
        }
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
