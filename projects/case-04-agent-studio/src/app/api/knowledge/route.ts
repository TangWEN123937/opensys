// GET  /api/knowledge        · 列知识库 + 总 chunks
// POST /api/knowledge        · { text, source } · 入库
// POST /api/knowledge/search · { query } · hybrid 检索

import { readCollection, writeCollection } from "@/server/store";
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

const uid = () => Math.random().toString(36).slice(2, 10);

function chunkText(text: string, size = 300, overlap = 40): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return out;
}

export async function GET() {
  const s = await readCollection<KBState>("knowledge", { chunks: [] });
  const bySource: Record<string, number> = {};
  for (const c of s.chunks) bySource[c.source] = (bySource[c.source] ?? 0) + 1;
  return Response.json({
    total: s.chunks.length,
    sources: Object.entries(bySource).map(([source, count]) => ({ source, count })),
  });
}

export async function POST(req: Request) {
  const { text, source } = (await req.json()) as { text: string; source?: string };
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  const state = await readCollection<KBState>("knowledge", { chunks: [] });
  const parts = chunkText(text);
  const src = source ?? `inline-${uid()}`;
  const newChunks: Chunk[] = parts.map((p) => ({
    id: uid(),
    source: src,
    text: p,
    vec: embed(p),
  }));
  state.chunks.push(...newChunks);
  await writeCollection("knowledge", state);
  await audit({ actor: "user", action: "knowledge.ingest", target: src, meta: `chunks:${newChunks.length}` });
  return Response.json({ ok: true, source: src, chunks: newChunks.length, total: state.chunks.length });
}
