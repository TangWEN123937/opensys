"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Wrench,
  Search,
  Plus,
  Play,
  Copy,
  Code2,
  Send,
  CheckCircle2,
  Calculator,
  Globe,
  Hash,
  Clock,
} from "lucide-react";

interface Tool {
  name: string;
  description: string;
  schema: {
    type: string;
    properties: Record<string, { type: string; description?: string; enum?: string[]; default?: unknown }>;
    required?: string[];
  };
}

const iconFor = (name: string) => {
  if (name === "calc") return { icon: Calculator, color: "text-model", bg: "bg-model/10" };
  if (name === "web_search") return { icon: Globe, color: "text-tool", bg: "bg-tool/10" };
  if (name === "uuid_gen") return { icon: Hash, color: "text-skill", bg: "bg-skill/10" };
  if (name === "date_diff") return { icon: Clock, color: "text-memory", bg: "bg-memory/10" };
  return { icon: Wrench, color: "text-ink-soft", bg: "bg-elevated" };
};

const DEFAULT_INPUT: Record<string, string> = {
  calc: '{\n  "expr": "(3+4)*5-10"\n}',
  date_diff: '{\n  "from": "2025-01-01",\n  "to": "2026-04-22"\n}',
  uuid_gen: '{\n  "n": 3\n}',
  web_search: '{\n  "query": "Model Context Protocol"\n}',
};

// Demo fallback 数据 · 真 API 失败时展示 · 和后端规范对齐
const DEMO_TOOLS: Tool[] = [
  {
    name: "calc",
    description: "数学表达式求值(安全白名单)",
    schema: {
      type: "object",
      properties: { expr: { type: "string", description: "表达式" } },
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
    description: "网络搜索(DuckDuckGo)",
    schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

export default function ToolsRegistryPage() {
  const [tools, setTools] = useState<Tool[]>(DEMO_TOOLS);
  const [selected, setSelected] = useState<Tool>(DEMO_TOOLS[0]);
  const [real, setReal] = useState(false);
  const [testInput, setTestInput] = useState(DEFAULT_INPUT.calc);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [latency, setLatency] = useState(0);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    fetch("/api/tools")
      .then((r) => r.json())
      .then((j) => {
        if (j.tools?.length > 0) {
          setTools(j.tools);
          setSelected(j.tools[0]);
          setReal(true);
          setTestInput(DEFAULT_INPUT[j.tools[0].name] ?? "{\n  \n}");
        }
      })
      .catch(() => {});
  }, []);

  // 切换选中工具 · input 模板也跟着换
  useEffect(() => {
    setTestInput(DEFAULT_INPUT[selected.name] ?? "{\n  \n}");
    setResult(null);
    setOk(true);
  }, [selected.name]);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const input = JSON.parse(testInput);
      const r = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected.name, input }),
      });
      const j = await r.json();
      setOk(Boolean(j.ok));
      setResult(JSON.stringify(j.ok ? j.result : { error: j.error }, null, 2));
      setLatency(j.ms ?? 0);
    } catch (e) {
      setOk(false);
      setResult(`解析 input 失败: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <PageShell
      title="Tools Registry"
      subtitle={`${tools.length} function calling 工具 · JSON Schema 规范 · ${real ? "真 · /api/tools" : "演示数据"}`}
      actions={
        <>
          <Badge variant={real ? "success" : "warning"} className="text-[10px]">
            {real ? "● 真数据" : "◯ 演示数据"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const all = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
              navigator.clipboard.writeText(JSON.stringify(all, null, 2));
              notify.ok(`${tools.length} 个 tool schema 已复制`);
            }}
          >
            <Code2 className="w-3.5 h-3.5" /> 查看所有 Schema
          </Button>
          <Button size="sm" onClick={() => notify.todo("新建自定义 Tool · 填 name + schema + 执行脚本")}>
            <Plus className="w-3.5 h-3.5" /> 新建 Tool
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-56px-48px)]">
        {/* Left · list */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border-subtle">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" />
              <input placeholder="搜索 tool..." className="w-full h-8 pl-8 pr-3 text-[12px] rounded-md border border-border bg-surface focus:outline-none focus:border-primary/40" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {tools.map((t) => {
              const meta = iconFor(t.name);
              const Icon = meta.icon;
              const active = selected.name === t.name;
              return (
                <button
                  key={t.name}
                  onClick={() => setSelected(t)}
                  className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                    active ? "bg-primary-tint/60" : "hover:bg-elevated/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className={`w-6 h-6 rounded-md ${meta.bg} ${meta.color} flex items-center justify-center shrink-0`}>
                      <Icon className="w-3 h-3" strokeWidth={1.8} />
                    </div>
                    <span className="font-mono text-[12.5px] font-medium truncate">{t.name}</span>
                  </div>
                  <div className="pl-8 text-[10.5px] text-ink-mute truncate">{t.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right · Schema + Playground */}
        <div className="grid grid-rows-[auto_1fr_1fr] gap-4 min-h-0">
          {/* Header */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-lg ${iconFor(selected.name).bg} ${iconFor(selected.name).color} flex items-center justify-center`}>
                  {(() => {
                    const Icon = iconFor(selected.name).icon;
                    return <Icon className="w-5 h-5" strokeWidth={1.8} />;
                  })()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[17px] font-semibold font-mono">{selected.name}</h3>
                    <Badge variant={real ? "success" : "outline"} className="text-[10px]">
                      {real ? "real" : "demo"}
                    </Badge>
                  </div>
                  <p className="text-[12.5px] text-ink-soft mt-1 max-w-[600px] leading-relaxed">
                    {selected.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-ink-mute font-mono">
                <Stat k="参数数" v={`${Object.keys(selected.schema.properties ?? {}).length}`} />
                <Stat k="必填" v={`${(selected.schema.required ?? []).length}`} />
              </div>
            </div>
          </div>

          {/* Schema */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
              <h4 className="text-[12px] font-semibold flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5" /> JSON Schema · {selected.name}
              </h4>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" className="text-[11px] h-7"
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(openAIFormat(selected), null, 2))}>
                  <Copy className="w-3 h-3" /> OpenAI format
                </Button>
                <Button variant="ghost" size="sm" className="text-[11px] h-7"
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(anthropicFormat(selected), null, 2))}>
                  <Copy className="w-3 h-3" /> Anthropic format
                </Button>
              </div>
            </div>
            <pre className="flex-1 overflow-y-auto p-4 text-[11.5px] font-mono text-ink-soft leading-relaxed bg-elevated/30">
              {JSON.stringify({ name: selected.name, description: selected.description, input_schema: selected.schema }, null, 2)}
            </pre>
          </div>

          {/* Playground */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
              <h4 className="text-[12px] font-semibold flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" /> 在线测试 · Playground
              </h4>
              <Button size="sm" onClick={runTest} disabled={testing}>
                {testing ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    运行中
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> 运行
                  </>
                )}
              </Button>
            </div>
            <div className="flex-1 grid grid-cols-2 min-h-0">
              <div className="border-r border-border-subtle flex flex-col">
                <div className="px-3 py-1.5 border-b border-border-subtle text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">
                  input
                </div>
                <textarea
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  className="flex-1 p-3 text-[11.5px] font-mono text-ink-soft leading-relaxed bg-elevated/20 resize-none focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <div className="px-3 py-1.5 border-b border-border-subtle text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute flex items-center justify-between">
                  <span>response {real && <span className="text-success">(真 API)</span>}</span>
                  {result && (
                    <span className={`flex items-center gap-1 ${ok ? "text-success" : "text-danger"}`}>
                      <CheckCircle2 className="w-2.5 h-2.5" /> {ok ? "200" : "error"} · {latency}ms
                    </span>
                  )}
                </div>
                <pre className="flex-1 p-3 text-[11.5px] font-mono text-ink-soft leading-relaxed bg-elevated/20 overflow-y-auto whitespace-pre-wrap">
                  {result ?? (testing ? "…" : "// 点击「运行」测试")}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-wider text-ink-mute">{k}</div>
      <div className="text-[14px] font-semibold text-ink">{v}</div>
    </div>
  );
}

// 格式转换:OpenAI function calling format
function openAIFormat(t: Tool) {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.schema,
    },
  };
}

// Anthropic tool use format
function anthropicFormat(t: Tool) {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.schema,
  };
}
