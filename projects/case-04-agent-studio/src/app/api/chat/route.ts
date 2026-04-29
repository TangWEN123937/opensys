// POST /api/chat
// SSE 真流式 · 调 OpenRouter Claude-Haiku-4-5
// body: { query: string, systemPrompt?: string }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { query, systemPrompt } = await req.json();
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const model = process.env.DEFAULT_CHAT_MODEL || "anthropic/claude-haiku-4-5";

  if (!apiKey || apiKey.includes("xxxxx")) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3240",
      "X-Title": "Agent Studio",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        systemPrompt ? { role: "system", content: systemPrompt } : null,
        { role: "user", content: query },
      ].filter(Boolean),
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    return new Response(
      JSON.stringify({ error: `upstream ${upstream.status}: ${text}` }),
      { status: upstream.status, headers: { "Content-Type": "application/json" } },
    );
  }

  // 透传 SSE
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  (async () => {
    const tStart = Date.now();
    let buf = "";
    let totalTokens = 0;
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "start", model, t: Date.now() })}\n\n`));
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              totalTokens += 1;
              await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "token", delta })}\n\n`));
            }
          } catch {}
        }
      }
      const elapsed = Date.now() - tStart;
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "done", elapsedMs: elapsed, tokens: totalTokens })}\n\n`));
    } catch (e) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "error", message: (e as Error).message })}\n\n`));
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
