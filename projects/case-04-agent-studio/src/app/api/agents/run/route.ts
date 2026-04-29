// POST /api/agents/run · SSE
// body: { pattern, query, maxIter?, useSkill? }

import { runAgent, type Pattern } from "@/server/agent-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { pattern = "react", query, maxIter, useSkill } = (await req.json()) as {
    pattern?: Pattern;
    query: string;
    maxIter?: number;
    useSkill?: string;
  };
  if (!query) {
    return new Response(JSON.stringify({ error: "query required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  (async () => {
    try {
      for await (const ev of runAgent({ pattern, query, maxIter, useSkill })) {
        await writer.write(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
    } catch (e) {
      await writer.write(enc.encode(`data: ${JSON.stringify({ type: "error", message: (e as Error).message })}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
