"use client";

import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Database,
  Upload,
  FileText,
  Search,
  Plus,
  Trash2,
  FileSpreadsheet,
  FileImage,
  Zap,
  CheckCircle2,
} from "lucide-react";

const collections = [
  { id: "prod-docs", name: "产品文档", count: 128, totalChunks: 4820, size: "45 MB", icon: FileText, color: "text-memory" },
  { id: "customer-kb", name: "客户知识库", count: 84, totalChunks: 3120, size: "28 MB", icon: Database, color: "text-mcp" },
  { id: "policies", name: "合规手册", count: 24, totalChunks: 820, size: "8 MB", icon: FileText, color: "text-info" },
  { id: "media", name: "多媒体资源", count: 340, totalChunks: 2140, size: "812 MB", icon: FileImage, color: "text-skill" },
];

const searchResults = {
  vector: [
    { id: "v1", text: "OpenClaw 的 memory-lancedb 扩展用 LanceDB 做向量存储,内部通过 L2 距离转换为相似度分数 sim = 1 / (1 + d)。", score: 0.892 },
    { id: "v2", text: "memory-core 是 file-backed 的抽象层,提供 memory_search 和 memory_get 两个 tool。", score: 0.861 },
    { id: "v3", text: "active-memory 是 agentic RAG 子代理层,有 7 档 thinking 和 6 种 promptStyle。", score: 0.834 },
    { id: "v4", text: "memory-wiki 支持 corpus=all 同时搜 memory 和 wiki 两个语料,这是原生的多语料融合雏形。", score: 0.817 },
    { id: "v5", text: "OpenClaw 独创 Dreaming 机制把短期 memory 在空闲时 promote 到长期持久层。", score: 0.801 },
  ],
  bm25: [
    { id: "b1", text: "openclaw 主仓库有 4 个 memory 扩展:memory-core / memory-lancedb / memory-wiki / active-memory。", score: 8.42 },
    { id: "b2", text: "OpenClaw 的 CLI 命令 ltm 下有 list / search / stats 三个子命令查长期记忆。", score: 6.19 },
    { id: "b3", text: "memory-core 是 file-backed 的抽象层,提供 memory_search 和 memory_get 两个 tool。", score: 5.85 },
    { id: "b4", text: "memory_forget 支持按 UUID 精确删除或按 query 搜出后自动删。", score: 5.20 },
    { id: "b5", text: "memory-wiki 的 bridge 模式允许读 memory-core 的公共 artifacts 和事件流。", score: 4.93 },
  ],
  hybrid: [
    { id: "h1", text: "openclaw 主仓库有 4 个 memory 扩展:memory-core / memory-lancedb / memory-wiki / active-memory。", score: 0.967 },
    { id: "h2", text: "memory-core 是 file-backed 的抽象层,提供 memory_search 和 memory_get 两个 tool。", score: 0.921 },
    { id: "h3", text: "active-memory 是 agentic RAG 子代理层,有 7 档 thinking 和 6 种 promptStyle。", score: 0.884 },
    { id: "h4", text: "OpenClaw 的 memory-lancedb 扩展用 LanceDB 做向量存储。", score: 0.853 },
    { id: "h5", text: "memory-wiki 支持 corpus=all 同时搜 memory 和 wiki 两个语料。", score: 0.812 },
  ],
};

export default function KnowledgePage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("OpenClaw 的 memory 架构是怎么分层?");
  const [results, setResults] = useState<typeof searchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [total, setTotal] = useState(0);
  const [real, setReal] = useState(false);

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then((j) => {
        setTotal(j.total ?? 0);
        if ((j.total ?? 0) > 0) setReal(true);
      })
      .catch(() => {});
  }, []);

  const doUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    const text = await f.text();
    const r = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: f.name }),
    });
    const j = await r.json();
    if (j.ok) {
      setTotal(j.total);
      setReal(true);
      notify.ok(`✅ 入库成功 · ${j.chunks} chunks`, `总 ${j.total} · 文件: ${j.source}`);
    } else {
      notify.err("入库失败");
    }
  };

  const doSearch = async () => {
    setSearching(true);
    try {
      const r = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, topK: 5 }),
      });
      const j = await r.json();
      if (j.total > 0) {
        setResults(j);
        setReal(true);
      } else {
        setResults(null); // fallback to demo
      }
    } finally {
      setSearching(false);
    }
  };

  const display = results ?? searchResults;

  return (
    <PageShell
      title="Knowledge (RAG)"
      subtitle={`${real ? "真 · " + total + " chunks" : "演示数据"} · 上传文档入库 · Hybrid 检索调试`}
      actions={
        <>
          <Badge variant={real ? "success" : "warning"} className="text-[10px]">
            {real ? "● 真数据" : "◯ 演示数据"}
          </Badge>
          <input type="file" ref={fileRef} onChange={doUpload} accept=".md,.txt" className="hidden" />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> 上传文档
          </Button>
          <Button size="sm" onClick={() => notify.todo("新建知识库 · 命名 + embedding model + chunk size")}>
            <Plus className="w-3.5 h-3.5" /> 新建知识库
          </Button>
        </>
      }
    >
      {/* Top · 4 stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "知识库", value: "4", sub: "collections" },
          { label: "文档", value: "576", sub: "total docs" },
          { label: "Chunks", value: "10,900", sub: "embedded" },
          { label: "存储", value: "893 MB", sub: "vector + raw" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-[11px] text-ink-mute mb-1">{s.label}</div>
            <div className="text-[22px] font-bold font-mono text-ink">{s.value}</div>
            <div className="text-[11px] text-ink-mute font-mono">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Collections */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">知识库</h3>
          <Badge variant="mono" className="text-[10px]">4 collections</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0">
          {collections.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.id} className="p-5 border-r border-border-subtle last:border-r-0 hover:bg-elevated/40 transition-colors cursor-pointer">
                <Icon className={`w-5 h-5 ${c.color} mb-3`} strokeWidth={1.8} />
                <div className="text-[14px] font-semibold mb-0.5">{c.name}</div>
                <div className="text-[11px] text-ink-mute font-mono mb-3">{c.id}</div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-soft">{c.count} docs</span>
                  <span className="text-ink-mute font-mono">{c.totalChunks} chunks</span>
                </div>
                <div className="mt-1 text-[10px] text-ink-mute font-mono">{c.size}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hybrid search debug */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary" />
            Hybrid 检索调试 · 同 query 三种召回对比
          </h3>
          <Badge variant="mono" className="text-[10px]">演示数据</Badge>
        </div>
        <div className="p-4 border-b border-border-subtle flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
              className="w-full h-10 pl-9 pr-3 text-[13px] rounded-md border border-border bg-surface focus:outline-none focus:border-primary/40"
            />
          </div>
          <Button onClick={doSearch} disabled={searching}>
            {searching ? <span className="w-3 h-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {searching ? "检索中" : "检索"}
          </Button>
          {results && <Badge variant="success" className="text-[10px]"><CheckCircle2 className="w-3 h-3" /> 真结果</Badge>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border-subtle">
          <HitColumn title="Vector 召回" sub="128-dim hash · cosine" color="text-mcp" topBar="bg-mcp" results={display.vector} />
          <HitColumn title="BM25 召回" sub="keyword · CJK n-gram" color="text-model" topBar="bg-model" results={display.bm25} />
          <HitColumn title="Hybrid · RRF" sub="RRF k=60" color="text-primary" topBar="bg-primary" results={display.hybrid} />
        </div>
      </div>
    </PageShell>
  );
}

function HitColumn({
  title,
  sub,
  color,
  topBar,
  results,
}: {
  title: string;
  sub: string;
  color: string;
  topBar: string;
  results: { id: string; text: string; score: number }[];
}) {
  return (
    <div className="flex flex-col">
      <div className={`h-1 ${topBar}`} />
      <div className="px-4 py-3 border-b border-border-subtle">
        <div className={`text-[13px] font-semibold ${color}`}>{title}</div>
        <div className="text-[10.5px] text-ink-mute font-mono mt-0.5">{sub}</div>
      </div>
      <div className="p-3 space-y-1.5">
        {results.map((r, i) => (
          <div key={r.id} className="rounded border border-border-subtle bg-surface p-2.5 text-[11.5px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-ink-mute">#{i + 1}</span>
              <Badge variant="mono" className="text-[10px]">{r.score.toFixed(3)}</Badge>
            </div>
            <p className="text-ink-soft leading-relaxed line-clamp-3">{r.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
