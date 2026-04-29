// OpenRouter 统一 chat · 支持 stream / non-stream

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const defaultModel = process.env.DEFAULT_CHAT_MODEL || "anthropic/claude-haiku-4-5";
const flagshipModel = process.env.FLAGSHIP_CHAT_MODEL || "anthropic/claude-opus-4-7";

export function hasOpenRouterKey(): boolean {
  const k = process.env.OPENROUTER_API_KEY;
  return Boolean(k && !k.includes("xxxxx"));
}

export async function chat(
  messages: ChatMessage[],
  opts: { model?: "default" | "flagship" | string; temperature?: number; max_tokens?: number } = {},
): Promise<{ content: string; tokens: number; ms: number } | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.includes("xxxxx")) return null;

  const model =
    opts.model === "flagship"
      ? flagshipModel
      : opts.model && opts.model !== "default"
        ? opts.model
        : defaultModel;

  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3240",
      "X-Title": "Agent Studio",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 1024,
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  const tokens = json.usage?.total_tokens ?? 0;
  return { content, tokens, ms: Date.now() - t0 };
}

export async function* chatStream(
  messages: ChatMessage[],
  opts: { model?: "default" | "flagship" | string; temperature?: number; max_tokens?: number } = {},
): AsyncGenerator<{ delta: string } | { done: true; ms: number; tokens: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.includes("xxxxx")) {
    yield { delta: "[OpenRouter key 未配置 · 降级 mock 回答]" };
    yield { done: true, ms: 120, tokens: 10 };
    return;
  }
  const model =
    opts.model === "flagship" ? flagshipModel : opts.model && opts.model !== "default" ? opts.model : defaultModel;

  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3240",
      "X-Title": "Agent Studio",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 1024,
    }),
  });
  if (!res.ok || !res.body) {
    yield { delta: `[upstream ${res.status}]` };
    yield { done: true, ms: Date.now() - t0, tokens: 0 };
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let tokens = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        const delta = j.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          tokens += 1;
          yield { delta };
        }
      } catch {}
    }
  }
  yield { done: true, ms: Date.now() - t0, tokens };
}
