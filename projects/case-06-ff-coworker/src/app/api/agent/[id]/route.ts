import { getScript, scriptDurationMs } from "@/lib/agent-scripts";
import { detectMode, getModel, type AgentEvent } from "@/lib/runtime-config";
import { getPersona } from "@/lib/employee-personas";
import { LLMRunFailed, runWithOpenRouter } from "@/lib/openrouter-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export async function GET(_req: Request, { params }: RouteCtx) {
  const { id } = await params;
  const persona = getPersona(id);
  const script = getScript(id);

  if (!persona && !script) {
    return Response.json({ error: "agent_not_found", id }, { status: 404 });
  }

  const totalMs = scriptDurationMs(id);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };

      const mode = detectMode();
      send({
        t: "meta",
        agent: id,
        mode,
        model: mode === "live" ? getModel() : undefined,
        totalMs,
        steps: script?.length,
        startedAt: Date.now(),
      });

      // ─── L1 真 LLM 模式 ───────────────────────────────────
      let ranLive = false;
      if (mode === "live" && persona) {
        send({
          t: "log",
          level: "info",
          text: `🟢 真实模式 · 调用 ${getModel()} · 直播现场看 LLM 实时推理`,
        });
        try {
          await runWithOpenRouter(persona, send);
          ranLive = true;
        } catch (err) {
          // ─── L2 中途/启动失败 → 切剧本兜底 ─────────────
          const e = err as LLMRunFailed;
          send({
            t: "log",
            level: "warn",
            text: `⚠️ LLM 调用失败（${e.stage}: ${e.message}）· 切到 Mock 剧本兜底`,
          });
          if (e.partial) {
            // 已经有部分真事件流出去了 —— 不要再重放完整剧本，只补一个 done
            send({
              t: "done",
              summary: "（中途降级 · 已记录到此为止）",
            });
            send({ t: "end" });
            controller.close();
            return;
          }
          // 否则（启动就失败 / 0 事件）走完整剧本
        }
      }

      // ─── L3 Mock 剧本（默认 / 降级落点） ──────────────────
      if (!ranLive && script) {
        if (mode === "live") {
          // 已经发过 "warn 切到 Mock" 了
        } else {
          send({
            t: "log",
            level: "info",
            text: "🟡 演示模式 · 预设剧本（未配 OPENROUTER_API_KEY）",
          });
        }
        for (const step of script) {
          await new Promise((r) => setTimeout(r, step.delay));
          send(step.event as AgentEvent);
        }
      }

      send({ t: "end" });
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
