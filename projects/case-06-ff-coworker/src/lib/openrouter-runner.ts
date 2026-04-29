/**
 * 真调 OpenRouter（Claude Sonnet 4.6）· 流式 NDJSON 解析 · 转发为 SSE
 *
 * LLM 被 prompt 约束输出 NDJSON 流（每行一个事件），
 * 这里负责按行解析、容错、并把合法事件实时 emit 给前端。
 */

import {
  OPENROUTER_BASE,
  getApiKey,
  getModel,
  getTimeoutMs,
  type AgentEvent,
} from "./runtime-config";
import { buildSystemPrompt, type Persona } from "./employee-personas";

type SendFn = (e: AgentEvent) => void;

export class LLMRunFailed extends Error {
  constructor(public stage: string, msg: string, public partial: boolean) {
    super(`[${stage}] ${msg}`);
  }
}

/**
 * 主入口：真跑 LLM，把每条解析出的事件喂给 send。
 * 失败抛 LLMRunFailed，调用方决定是否降级。
 *
 * @param persona  员工角色
 * @param send     SSE 转发函数
 * @returns        本次是否产出过任何合法事件（用于决定降级行为）
 */
export async function runWithOpenRouter(
  persona: Persona,
  send: SendFn,
): Promise<{ emittedCount: number }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new LLMRunFailed("init", "no api key", false);

  const model = getModel();
  const timeoutMs = getTimeoutMs();

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3210",
        "X-Title": "FF-CoWorker · One-Person Company Demo",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.7,
        max_tokens: 3500,
        messages: [
          { role: "system", content: buildSystemPrompt(persona) },
          { role: "user", content: "开始执行任务。严格按 NDJSON 输出。" },
        ],
      }),
    });
  } catch (err) {
    clearTimeout(tid);
    throw new LLMRunFailed(
      "fetch",
      err instanceof Error ? err.message : String(err),
      false,
    );
  }

  if (!resp.ok || !resp.body) {
    clearTimeout(tid);
    let detail = "";
    try {
      detail = await resp.text();
    } catch {}
    throw new LLMRunFailed(
      "http",
      `${resp.status} ${resp.statusText}${detail ? ` · ${detail.slice(0, 200)}` : ""}`,
      false,
    );
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();

  let chunkBuf = ""; // OpenAI SSE 帧缓冲
  let ndjsonBuf = ""; // LLM 拼出来的 NDJSON 文本缓冲
  let emittedCount = 0;
  let totalTokens = 0;

  const flushLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // 容错：去掉可能出现的 ```json / ``` 包裹
    if (trimmed.startsWith("```")) return;
    try {
      const evt = JSON.parse(trimmed);
      if (evt && typeof evt === "object" && typeof evt.t === "string") {
        send(evt as AgentEvent);
        emittedCount++;
        if (evt.t === "mechanism" && typeof evt.tokens === "number") {
          totalTokens += evt.tokens;
        }
      }
    } catch {
      // 单行 JSON 解析失败 —— 静默丢弃，不打断流
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunkBuf += decoder.decode(value, { stream: true });

      // 按 OpenAI SSE 帧切：以 \n\n 分隔
      let frameEnd: number;
      while ((frameEnd = chunkBuf.indexOf("\n\n")) !== -1) {
        const frame = chunkBuf.slice(0, frameEnd);
        chunkBuf = chunkBuf.slice(frameEnd + 2);
        for (const ln of frame.split("\n")) {
          const line = ln.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const data = JSON.parse(payload);
            const delta: string | undefined = data?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              ndjsonBuf += delta;
              // 每攒到一个换行就尝试解析一行
              let nl: number;
              while ((nl = ndjsonBuf.indexOf("\n")) !== -1) {
                const oneLine = ndjsonBuf.slice(0, nl);
                ndjsonBuf = ndjsonBuf.slice(nl + 1);
                flushLine(oneLine);
              }
            }
          } catch {
            // 帧解析失败 —— 跳过
          }
        }
      }
    }
    // 末尾残留处理
    if (ndjsonBuf.trim()) flushLine(ndjsonBuf);
  } catch (err) {
    clearTimeout(tid);
    throw new LLMRunFailed(
      "stream",
      err instanceof Error ? err.message : String(err),
      emittedCount > 0,
    );
  }

  clearTimeout(tid);

  if (emittedCount === 0) {
    throw new LLMRunFailed("parse", "LLM 流结束但未产出任何合法事件", false);
  }

  // 收尾日志：让前端看见真实 token 用量
  send({
    t: "log",
    level: "ok",
    text: `🟢 LIVE · ${model} · 共 ${emittedCount} 事件 · 估算机制 token ≈ ${totalTokens.toLocaleString()}`,
  });

  return { emittedCount };
}
