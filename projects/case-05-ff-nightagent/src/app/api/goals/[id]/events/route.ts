import { NextRequest } from "next/server";
import { getGoal, getGoalEvents, subscribeGoal } from "@/lib/runs/goal-manager";
import type { GoalEvent } from "@/lib/runs/goal-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * SSE · 先回放历史 · 再订阅实时
 * 遇 goal_done 自动关流 · 断线重连可用 since_seq
 */
export async function GET(req: NextRequest, { params }: Props) {
  const { id } = await params;
  if (!getGoal(id)) return new Response("goal_not_found", { status: 404 });
  const url = new URL(req.url);
  const sinceSeq = parseInt(url.searchParams.get("since_seq") ?? "-1", 10);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const write = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      };

      for (const ev of getGoalEvents(id, sinceSeq)) write(ev);

      const unsub = subscribeGoal(id, (ev: GoalEvent) => {
        write(ev);
        if (ev.type === "goal_done") {
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        }
      });

      const hb = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 15000);

      const cleanup = () => {
        clearInterval(hb);
        unsub?.();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      req.signal.addEventListener("abort", cleanup);

      const g = getGoal(id);
      if (g?.status === "done") cleanup();
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
