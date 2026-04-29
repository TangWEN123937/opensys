import { NextRequest } from "next/server";
import { getRun, getEvents, subscribe } from "@/lib/runs/manager";
import type { RunEvent } from "@/lib/runs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * SSE 流 · 先回放历史事件（保证断线重连不丢）· 再订阅实时事件
 * 遵守规范：完整事件流到 done · 无中文 HTTP header · keep-alive ping 每 15s
 */
export async function GET(req: NextRequest, { params }: Props) {
  const { id } = await params;
  if (!getRun(id)) {
    return new Response("run_not_found", { status: 404 });
  }
  const url = new URL(req.url);
  const sinceSeq = parseInt(url.searchParams.get("since_seq") ?? "-1", 10);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const writeEv = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      };

      // 1) 立即回放历史事件
      const history = getEvents(id, sinceSeq);
      for (const ev of history) writeEv(ev);

      // 2) 订阅实时事件
      const unsub = subscribe(id, (ev: RunEvent) => {
        writeEv(ev);
        if (ev.type === "run_done") {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      });

      // 3) keep-alive ping（15s）· 纯 comment · 避免代理断连
      const hb = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 15000);

      // 4) abort 清理
      const cleanup = () => {
        clearInterval(hb);
        unsub?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);

      // 如果 run 已 done · 且历史已发完 · 主动关
      const run = getRun(id);
      if (run?.state === "done") {
        cleanup();
      }
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
