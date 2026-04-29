// MVP · hash-LCG 确定性 embedding · 无 key 也能跑

export function embed(text: string, dims = 128): number[] {
  // DJB2-ish seed + LCG
  let seed = 5381;
  for (let i = 0; i < text.length; i++) seed = ((seed * 33) ^ text.charCodeAt(i)) >>> 0;
  const v = new Array(dims);
  let x = seed || 1;
  for (let i = 0; i < dims; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    v[i] = (x / 0xffffffff) * 2 - 1;
  }
  // normalize
  const norm = Math.sqrt(v.reduce((s, a) => s + a * a, 0));
  return v.map((a) => a / norm);
}

export function cosine(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

// 简易 BM25 · 关键词匹配打分
export function bm25(query: string, doc: string): number {
  const qTerms = query.toLowerCase().match(/[一-龥]|[a-z0-9]+/g) ?? [];
  const d = doc.toLowerCase();
  let score = 0;
  for (const t of qTerms) {
    const m = d.match(new RegExp(t, "g"));
    if (m) score += m.length / (d.length / 100 + 1);
  }
  return score;
}
