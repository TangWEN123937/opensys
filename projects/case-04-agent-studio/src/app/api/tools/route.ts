// GET /api/tools · 列可用工具
// POST /api/tools · { name, input } · 真执行

import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Tool {
  name: string;
  description: string;
  schema: object;
}

const TOOLS: Tool[] = [
  {
    name: "calc",
    description: "数学表达式求值(安全白名单:+,-,*,/,%,(,),.,数字)",
    schema: {
      type: "object",
      properties: { expr: { type: "string", description: "表达式 · 如 (3+4)*5/2" } },
      required: ["expr"],
    },
  },
  {
    name: "date_diff",
    description: "日期差值(天)",
    schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "起始日期 ISO" },
        to: { type: "string", description: "结束日期 ISO" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "uuid_gen",
    description: "生成 N 个 UUID v4",
    schema: {
      type: "object",
      properties: { n: { type: "integer", default: 1 } },
    },
  },
  {
    name: "web_search",
    description: "网络搜索 · DuckDuckGo Instant Answer(免 key)",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索词" },
      },
      required: ["query"],
    },
  },
];

export async function GET() {
  return Response.json({ tools: TOOLS });
}

export async function POST(req: Request) {
  const { name, input } = (await req.json()) as { name: string; input: Record<string, unknown> };
  const t0 = Date.now();
  let result: unknown;
  let ok = true;
  let error: string | undefined;

  try {
    if (name === "calc") {
      const expr = String(input.expr ?? "");
      if (!/^[\d+\-*/%.() ]+$/.test(expr)) throw new Error("非法表达式 · 仅允许数字和 + - * / % . ( )");
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      result = { value: Function(`"use strict"; return (${expr});`)() };
    } else if (name === "date_diff") {
      const a = new Date(String(input.from));
      const b = new Date(String(input.to));
      const ms = b.getTime() - a.getTime();
      result = { days: Math.round(ms / 86400000), ms };
    } else if (name === "uuid_gen") {
      const n = Math.max(1, Math.min(100, Number(input.n ?? 1)));
      result = { uuids: Array.from({ length: n }, () => crypto.randomUUID()) };
    } else if (name === "web_search") {
      const q = String(input.query ?? "");
      const r = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
      );
      if (!r.ok) throw new Error(`DuckDuckGo ${r.status}`);
      const j = await r.json();
      result = {
        abstract: j.AbstractText,
        source: j.AbstractSource,
        url: j.AbstractURL,
        related: (j.RelatedTopics ?? []).slice(0, 5).map((t: { Text?: string; FirstURL?: string }) => ({
          text: t.Text,
          url: t.FirstURL,
        })),
      };
    } else {
      throw new Error(`未知 tool: ${name}`);
    }
  } catch (e) {
    ok = false;
    error = (e as Error).message;
  }
  const ms = Date.now() - t0;
  await audit({
    actor: "user",
    action: `tool.${name}`,
    target: JSON.stringify(input).slice(0, 60),
    meta: `ms:${ms} ok:${ok}`,
    level: ok ? "info" : "error",
  });

  return Response.json({ ok, name, result, error, ms });
}
