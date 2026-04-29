"use client";

import { useCallback } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  MarkerType,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import {
  Play,
  Save,
  Undo2,
  Redo2,
  Zap,
  Plus,
  MessageSquare,
  Cpu,
  Wrench,
  Puzzle,
  Server,
  Brain,
  CircleCheck,
  GitBranch,
} from "lucide-react";

// 节点类型 · 按颜色区分
type StudioNodeData = {
  label: string;
  subtitle?: string;
  kind: "input" | "llm" | "tool" | "skill" | "mcp" | "memory" | "branch" | "output";
  running?: boolean;
};

function StudioNode({ data }: NodeProps<StudioNodeData>) {
  const config = {
    input: { icon: MessageSquare, tint: "bg-[hsl(210_75%_96%)]", color: "text-info", border: "border-info/30" },
    llm: { icon: Cpu, tint: "bg-[hsl(38_85%_95%)]", color: "text-model", border: "border-model/30" },
    tool: { icon: Wrench, tint: "bg-[hsl(185_65%_94%)]", color: "text-tool", border: "border-tool/30" },
    skill: { icon: Puzzle, tint: "bg-[hsl(320_50%_96%)]", color: "text-skill", border: "border-skill/30" },
    mcp: { icon: Server, tint: "bg-[hsl(155_50%_95%)]", color: "text-mcp", border: "border-mcp/30" },
    memory: { icon: Brain, tint: "bg-[hsl(25_75%_95%)]", color: "text-memory", border: "border-memory/30" },
    branch: { icon: GitBranch, tint: "bg-elevated", color: "text-ink-soft", border: "border-border" },
    output: { icon: CircleCheck, tint: "bg-[hsl(145_55%_95%)]", color: "text-success", border: "border-success/30" },
  }[data.kind];
  const Icon = config.icon;

  return (
    <div className={`group min-w-[180px] rounded-xl border ${config.border} ${config.tint} bg-surface shadow-sm transition-all hover:shadow-md hover:-translate-y-px`}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-ink-mute !border-none" />
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-lg bg-surface border border-border-subtle flex items-center justify-center shrink-0 ${config.color}`}>
          <Icon className="w-4 h-4" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-ink truncate">{data.label}</span>
            {data.running && (
              <span className="relative flex w-1.5 h-1.5">
                <span className={`absolute inset-0 rounded-full ${config.color.replace("text-", "bg-")} animate-ping opacity-75`} />
                <span className={`relative w-1.5 h-1.5 rounded-full ${config.color.replace("text-", "bg-")}`} />
              </span>
            )}
          </div>
          {data.subtitle && (
            <div className="text-[10px] font-mono text-ink-mute mt-0.5 truncate">{data.subtitle}</div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-ink-mute !border-none" />
    </div>
  );
}

const nodeTypes = { studio: StudioNode };

const initialNodes: Node<StudioNodeData>[] = [
  { id: "1", type: "studio", position: { x: 40, y: 180 }, data: { label: "用户 Query", subtitle: "input", kind: "input" } },
  { id: "2", type: "studio", position: { x: 280, y: 80 }, data: { label: "Memory 召回", subtitle: "last 10 turns", kind: "memory" } },
  { id: "3", type: "studio", position: { x: 280, y: 280 }, data: { label: "Knowledge 检索", subtitle: "hybrid · top-5", kind: "mcp" } },
  { id: "4", type: "studio", position: { x: 560, y: 180 }, data: { label: "Claude Haiku 4.5", subtitle: "reasoning + plan", kind: "llm", running: true } },
  { id: "5", type: "studio", position: { x: 840, y: 80 }, data: { label: "web_search", subtitle: "tool", kind: "tool" } },
  { id: "6", type: "studio", position: { x: 840, y: 280 }, data: { label: "pdf-extract", subtitle: "skill", kind: "skill" } },
  { id: "7", type: "studio", position: { x: 1120, y: 180 }, data: { label: "Answer", subtitle: "stream + cite", kind: "output" } },
];

const initialEdges: Edge[] = [
  { id: "e1-2", source: "1", target: "2", animated: true, style: { stroke: "hsl(222 60% 40%)", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(222 60% 40%)" } },
  { id: "e1-3", source: "1", target: "3", animated: true, style: { stroke: "hsl(222 60% 40%)", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(222 60% 40%)" } },
  { id: "e2-4", source: "2", target: "4", style: { stroke: "hsl(222 14% 70%)", strokeWidth: 1.3 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(222 14% 60%)" } },
  { id: "e3-4", source: "3", target: "4", style: { stroke: "hsl(222 14% 70%)", strokeWidth: 1.3 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(222 14% 60%)" } },
  { id: "e4-5", source: "4", target: "5", animated: true, style: { stroke: "hsl(222 60% 40%)", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(222 60% 40%)" } },
  { id: "e4-6", source: "4", target: "6", animated: true, style: { stroke: "hsl(222 60% 40%)", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(222 60% 40%)" } },
  { id: "e5-7", source: "5", target: "7", style: { stroke: "hsl(222 14% 70%)", strokeWidth: 1.3 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(222 14% 60%)" } },
  { id: "e6-7", source: "6", target: "7", style: { stroke: "hsl(222 14% 70%)", strokeWidth: 1.3 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(222 14% 60%)" } },
];

const paletteItems = [
  { kind: "input" as const, label: "Input", color: "text-info" },
  { kind: "llm" as const, label: "LLM", color: "text-model" },
  { kind: "tool" as const, label: "Tool", color: "text-tool" },
  { kind: "skill" as const, label: "Skill", color: "text-skill" },
  { kind: "mcp" as const, label: "MCP", color: "text-mcp" },
  { kind: "memory" as const, label: "Memory", color: "text-memory" },
  { kind: "branch" as const, label: "Branch", color: "text-ink-soft" },
  { kind: "output" as const, label: "Output", color: "text-success" },
];

const paletteIcons: Record<StudioNodeData["kind"], React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  input: MessageSquare,
  llm: Cpu,
  tool: Wrench,
  skill: Puzzle,
  mcp: Server,
  memory: Brain,
  branch: GitBranch,
  output: CircleCheck,
};

export default function StudioPage() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const addNode = useCallback((kind: StudioNodeData["kind"]) => {
    notify.info(`+ 新增 ${kind} 节点`, "拖拽画布空白处落位 · MVP 使用 ReactFlow 内置拖拽");
  }, []);

  const runAgent = async () => {
    const tid = await import("sonner").then((m) => m.toast.loading("运行中 · 调 /api/agents/run"));
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: "react", query: "OpenClaw memory 架构怎么分层?" }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let spans = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = dec.decode(value);
        spans += (text.match(/span_start/g) ?? []).length;
      }
      const { toast } = await import("sonner");
      toast.success(`✅ 运行完成 · 经过 ${spans} 个 span`, { id: tid, description: "点 Trace Waterfall 看详情" });
    } catch (e) {
      const { toast } = await import("sonner");
      toast.error(`运行失败: ${(e as Error).message}`, { id: tid });
    }
  };

  return (
    <PageShell
      title="Agent Studio"
      subtitle="拖拽式 DAG 编排 · 节点即 Tool / Skill / MCP / LLM · 运行态高亮"
      actions={
        <>
          <Button variant="ghost" size="icon" onClick={() => notify.todo("Undo")}>
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => notify.todo("Redo")}>
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => notify.ok("已保存 DAG 到本地", "data/studio-dag.json")}>
            <Save className="w-3.5 h-3.5" /> 保存
          </Button>
          <Button size="sm" onClick={runAgent}>
            <Play className="w-3.5 h-3.5" /> 运行
          </Button>
        </>
      }
      noPadding
    >
      <div className="flex h-[calc(100vh-56px)]">
        {/* Left · Node Palette */}
        <aside className="w-[220px] shrink-0 border-r border-border bg-surface flex flex-col">
          <div className="px-4 py-3 border-b border-border-subtle">
            <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2">Node Palette</div>
            <p className="text-[11px] text-ink-mute leading-relaxed">拖拽节点到画布 · 连线组装 Agent 图</p>
          </div>
          <div className="p-2 grid grid-cols-2 gap-1.5 overflow-y-auto">
            {paletteItems.map((p) => {
              const Icon = paletteIcons[p.kind];
              return (
                <button
                  key={p.kind}
                  onClick={() => addNode(p.kind)}
                  className="flex flex-col items-center justify-center gap-1 py-3 rounded-lg border border-border-subtle bg-surface hover:bg-elevated hover:border-ink-mute transition-all"
                >
                  <Icon className={`w-4 h-4 ${p.color}`} strokeWidth={1.8} />
                  <span className="text-[11px] font-medium">{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Run stats */}
          <div className="mt-auto p-3 border-t border-border-subtle space-y-2.5">
            <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute">运行统计</div>
            <Stat label="节点" value={`${nodes.length}`} />
            <Stat label="连线" value={`${edges.length}`} />
            <Stat label="模式" value="ReAct" badge />
            <Stat label="上次耗时" value="1.84s" />
          </div>
        </aside>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(222 14% 60%)" },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="hsl(222 14% 88%)" />
            <MiniMap
              nodeColor={(n) => {
                const kind = (n.data as StudioNodeData | undefined)?.kind;
                return {
                  input: "hsl(210 75% 55%)",
                  llm: "hsl(38 85% 55%)",
                  tool: "hsl(185 65% 50%)",
                  skill: "hsl(320 50% 58%)",
                  mcp: "hsl(155 50% 48%)",
                  memory: "hsl(25 75% 55%)",
                  branch: "hsl(222 14% 60%)",
                  output: "hsl(145 55% 45%)",
                }[kind ?? "input"];
              }}
              maskColor="hsl(222 14% 95% / 0.5)"
              className="!bg-surface !border !border-border rounded-lg"
            />
            <Controls className="!bg-surface !border !border-border !rounded-lg !shadow-sm" />
          </ReactFlow>

          {/* Top right · run status */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <Badge variant="outline" className="font-mono">7 nodes · 8 edges</Badge>
            <div className="h-8 px-3 rounded-md bg-surface border border-border flex items-center gap-2 shadow-sm">
              <span className="relative w-1.5 h-1.5 rounded-full bg-success">
                <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-70" />
              </span>
              <span className="text-[11px] font-mono text-success font-medium">运行中 · step 3 / 7</span>
            </div>
          </div>
        </div>

        {/* Right · Inspector */}
        <aside className="w-[320px] shrink-0 border-l border-border bg-surface overflow-y-auto">
          <div className="px-5 py-3.5 border-b border-border-subtle">
            <h3 className="text-[13px] font-semibold tracking-tight">节点检视器</h3>
            <p className="text-[11px] text-ink-mute mt-0.5">Claude Haiku 4.5 · 选中节点</p>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-ink-mute">Provider</label>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant="mono">OpenRouter</Badge>
                <Badge variant="outline">anthropic/claude-haiku-4-5</Badge>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-ink-mute mb-1.5 block">System Prompt</label>
              <div className="rounded-md border border-border bg-elevated p-2.5 text-[11.5px] font-mono text-ink-soft leading-relaxed">
                You are a research agent. Plan steps, call tools, cite sources...
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Kv k="Temperature" v="0.7" />
              <Kv k="Max tokens" v="2048" />
              <Kv k="Top p" v="0.9" />
              <Kv k="Streaming" v="true" mono />
            </div>
            <div>
              <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-ink-mute mb-1.5 block">绑定 Tools</label>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-tool"><Wrench className="w-3 h-3" /> web_search</Badge>
                <Badge variant="outline" className="text-skill"><Puzzle className="w-3 h-3" /> pdf-extract</Badge>
              </div>
            </div>
            <div className="pt-3 border-t border-border-subtle text-[11px] text-ink-mute leading-relaxed">
              <Zap className="w-3 h-3 inline mr-1 text-accent" />
              真实运行时:节点呼吸灯 + 连线流光 + 右侧 Trace 面板实时更新
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}

function Stat({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11.5px]">
      <span className="text-ink-mute">{label}</span>
      {badge ? (
        <Badge variant="mono" className="text-[10px]">{value}</Badge>
      ) : (
        <span className="font-mono text-ink font-medium">{value}</span>
      )}
    </div>
  );
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-ink-mute uppercase tracking-wider">{k}</div>
      <div className={`text-[13px] ${mono ? "font-mono" : ""} text-ink`}>{v}</div>
    </div>
  );
}
