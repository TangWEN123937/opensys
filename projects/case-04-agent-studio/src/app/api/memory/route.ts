// GET  /api/memory          · 列 long-term facts + short-term turns
// POST /api/memory          · { action: "save_fact" | "add_turn" | "clear", ... }

import { readCollection, writeCollection } from "@/server/store";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Fact {
  key: string;
  value: string;
  category: "entity" | "fact" | "preference";
  confidence: number;
  updatedAt: number;
}

interface Turn {
  role: "user" | "agent";
  text: string;
  t: number;
  tokens?: number;
}

interface MemState {
  facts: Fact[];
  turns: Turn[];
}

function defaultMem(): MemState {
  return {
    facts: [
      { key: "user.lang", value: "中文", category: "preference", confidence: 1.0, updatedAt: Date.now() - 3 * 86400000 },
      { key: "user.tz", value: "Asia/Shanghai", category: "fact", confidence: 1.0, updatedAt: Date.now() - 5 * 86400000 },
      { key: "project.stack", value: "Next.js 16 · Tailwind v4 · shadcn", category: "fact", confidence: 0.92, updatedAt: Date.now() },
    ],
    turns: [],
  };
}

export async function GET() {
  const s = await readCollection<MemState>("memory", defaultMem());
  return Response.json(s);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { action: string; [k: string]: unknown };
  const state = await readCollection<MemState>("memory", defaultMem());

  if (body.action === "save_fact") {
    const { key, value, category = "fact", confidence = 0.9 } = body as {
      action: string;
      key: string;
      value: string;
      category?: Fact["category"];
      confidence?: number;
    };
    const i = state.facts.findIndex((f) => f.key === key);
    const fact: Fact = { key, value, category, confidence, updatedAt: Date.now() };
    if (i >= 0) state.facts[i] = fact;
    else state.facts.push(fact);
    await audit({ actor: "user", action: "memory.save_fact", target: key, meta: value.slice(0, 40) });
  } else if (body.action === "add_turn") {
    const { role, text, tokens } = body as { role: Turn["role"]; text: string; tokens?: number };
    state.turns.push({ role, text, tokens, t: Date.now() });
    // keep last 50
    state.turns = state.turns.slice(-50);
  } else if (body.action === "clear") {
    const { scope = "turns" } = body as { scope?: "turns" | "facts" | "all" };
    if (scope === "turns" || scope === "all") state.turns = [];
    if (scope === "facts" || scope === "all") state.facts = [];
    await audit({ actor: "user", action: "memory.clear", target: scope });
  }

  await writeCollection("memory", state);
  return Response.json({ ok: true, facts: state.facts.length, turns: state.turns.length });
}
