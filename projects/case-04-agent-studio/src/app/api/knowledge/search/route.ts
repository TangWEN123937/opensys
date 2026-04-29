// POST /api/knowledge/search · { query, topK? } · hybrid(vector + BM25 · RRF 融合)

import { readCollection } from "@/server/store";
import { embed, cosine, bm25 } from "@/server/embed";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Chunk {
  id: string;
  source: string;
  text: string;
  vec: number[];
}

interface KBState {
  chunks: Chunk[];
}

export async function POST(req: Request) {
  const { query, topK = 5 } = (await req.json()) as { query: string; topK?: number };
  const s = await readCollection<KBState>("knowledge", { chunks: [] });
  if (s.chunks.length === 0) {
    return Response.json({ vector: [], bm25: [], hybrid: [], total: 0 });
  }
  const q = embed(query);
  const withScores = s.chunks.map((c) => ({
    c,
    v: cosine(q, c.vec),
    b: bm25(query, c.text),
  }));
  const sortedV = [...withScores].sort((a, b) => b.v - a.v).slice(0, topK);
  const sortedB = [...withScores].sort((a, b) => b.b - a.b).slice(0, topK);

  // RRF fusion k=60
  const k = 60;
  const rrf = new Map<string, number>();
  sortedV.forEach((r, i) => rrf.set(r.c.id, (rrf.get(r.c.id) ?? 0) + 1 / (k + i + 1)));
  sortedB.forEach((r, i) => rrf.set(r.c.id, (rrf.get(r.c.id) ?? 0) + 1 / (k + i + 1)));
  const hybrid = withScores
    .map((r) => ({ ...r, rrf: rrf.get(r.c.id) ?? 0 }))
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, topK);

  const fmt = (r: { c: Chunk; v: number; b?: number; rrf?: number }, sKey: "v" | "b" | "rrf") => ({
    id: r.c.id,
    source: r.c.source,
    text: r.c.text,
    score: Number((r[sKey] as number).toFixed(4)),
  });

  await audit({ actor: "user", action: "knowledge.search", target: query.slice(0, 40) });
  return Response.json({
    vector: sortedV.map((r) => fmt(r, "v")),
    bm25: sortedB.map((r) => fmt(r, "b")),
    hybrid: hybrid.map((r) => fmt(r, "rrf")),
    total: s.chunks.length,
  });
}
