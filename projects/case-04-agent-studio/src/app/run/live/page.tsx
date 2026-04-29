"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import {
  Play,
  Square,
  Brain,
  Wrench,
  Puzzle,
  Eye,
  FileCode,
  FileText,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface Iter {
  iter: number;
  thought: string;           // 流式累加
  thoughtDone: boolean;
  action?: { name: string; args: Record<string, unknown> };
  toolInput?: unknown;
  toolOutput?: string;
  toolMs?: number;
  observation?: string;
  skillScript?: string;      // Level 3 触发的 script
}

interface SkillReveal {
  name: string;
  meta?: { name: string; description: string; version: string };
  body?: string;
  scripts: string[];         // 被 invoke 的 script 列表
}

export default function LiveRunPage() {
  const sp = useSearchParams();
  const initialSkill = sp.get("useSkill") ?? "";
  const [query, setQuery] = useState("用 web_search 搜 'Model Context Protocol' 然后告诉我它是什么");
  const [pattern, setPattern] = useState<"react" | "plan-execute" | "reflexion">("react");
  const [useSkill, setUseSkill] = useState<string>(initialSkill);
  const [running, setRunning] = useState(false);
  const [iters, setIters] = useState<Iter[]>([]);
  const [skill, setSkill] = useState<SkillReveal | null>(null);
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState(false);
  const [totalMs, setTotalMs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setRunning(true);
    setDone(false);
    setIters([]);
    setSkill(null);
    setAnswer("");

    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern,
          query,
          maxIter: 2,
          useSkill: useSkill || undefined,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (!data) continue;
          try {
            applyEvent(JSON.parse(data));
          } catch {}
        }
      }
      setDone(true);
    } catch (e) {
      notify.err(`运行失败: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const applyEvent = (
    ev: {
      type: string;
      iter?: number;
      delta?: string;
      full?: string;
      action?: string;
      args?: Record<string, unknown>;
      toolName?: string;
      toolInput?: unknown;
      toolOutput?: string;
      toolMs?: number;
      skillName?: string;
      skillMeta?: { name: string; description: string; version: string };
      skillBody?: string;
      skillScript?: string;
      totalMs?: number;
      message?: string;
    },
  ) => {
    switch (ev.type) {
      case "skill_discovered":
        setSkill({ name: ev.skillName!, meta: ev.skillMeta, scripts: [] });
        break;
      case "skill_body_loaded":
        setSkill((s) => (s ? { ...s, body: ev.skillBody } : s));
        break;
      case "skill_script_invoked":
        setSkill((s) => (s ? { ...s, scripts: [...s.scripts, ev.skillScript!] } : s));
        setIters((arr) =>
          arr.map((it) => (it.iter === ev.iter ? { ...it, skillScript: ev.skillScript } : it)),
        );
        break;
      case "react_iter_start":
        setIters((arr) => [...arr, { iter: ev.iter!, thought: "", thoughtDone: false }]);
        break;
      case "thought":
        setIters((arr) =>
          arr.map((it) => (it.iter === ev.iter ? { ...it, thought: it.thought + (ev.delta ?? "") } : it)),
        );
        break;
      case "thought_done":
        setIters((arr) =>
          arr.map((it) =>
            it.iter === ev.iter ? { ...it, thought: ev.full ?? it.thought, thoughtDone: true } : it,
          ),
        );
        break;
      case "action_chosen":
        setIters((arr) =>
          arr.map((it) =>
            it.iter === ev.iter ? { ...it, action: { name: ev.action!, args: ev.args ?? {} } } : it,
          ),
        );
        break;
      case "tool_call_start":
        setIters((arr) =>
          arr.map((it) => (it.iter === ev.iter ? { ...it, toolInput: ev.toolInput } : it)),
        );
        break;
      case "tool_call_end":
        setIters((arr) =>
          arr.map((it) =>
            it.iter === ev.iter
              ? { ...it, toolOutput: ev.toolOutput, toolMs: ev.toolMs }
              : it,
          ),
        );
        break;
      case "observation":
        setIters((arr) =>
          arr.map((it) => (it.iter === ev.iter ? { ...it, observation: ev.full } : it)),
        );
        break;
      case "llm_token":
        setAnswer((a) => a + (ev.delta ?? ""));
        break;
      case "answer_done":
        setAnswer(ev.full ?? "");
        break;
      case "run_end":
        setTotalMs(ev.totalMs ?? 0);
        break;
      case "error":
        notify.err(ev.message ?? "error");
        break;
    }
  };

  return (
    <PageShell
      title="Live Run · ReAct 可视化"
      subtitle="点击「发起」观察 Agent 每步的完整中间数据 · Thought / Action / Observation 逐行显示 · Skill 3 层渐进披露"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* Left · 控制面板 */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface p-5">
            <label className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2 block">Query</label>
            <Textarea
              rows={4}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="text-[13px] font-mono"
            />
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <label className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2 block">Pattern</label>
            <div className="space-y-1.5">
              {(["react", "plan-execute", "reflexion"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPattern(p)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-[12.5px] font-mono transition-colors ${
                    pattern === p ? "bg-primary text-primary-foreground" : "hover:bg-elevated border border-border"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${pattern === p ? "bg-accent" : "bg-ink-mute"}`} />
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <label className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2 block">激活 Skill(可选)</label>
            <select
              value={useSkill}
              onChange={(e) => setUseSkill(e.target.value)}
              className="w-full h-9 px-3 text-[12.5px] font-mono rounded-md border border-border bg-surface focus:outline-none focus:border-primary/40"
            >
              <option value="">不激活 · 只用通用工具</option>
              <option value="pdf-extract">pdf-extract</option>
              <option value="kpi-analyst">kpi-analyst</option>
              <option value="code-review-guide">code-review-guide</option>
            </select>
            <p className="text-[10.5px] text-ink-mute mt-2 leading-relaxed">
              选中后会演示 Skill 3 层渐进披露: <br />
              <b className="text-ink">Level 1</b> frontmatter → <b className="text-ink">Level 2</b> body → <b className="text-ink">Level 3</b> script invoke
            </p>
          </div>

          <Button onClick={run} disabled={running || !query} className="w-full h-11">
            {running ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                运行中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" /> 发起 Live Run
              </>
            )}
          </Button>
          {running && (
            <Button variant="outline" onClick={() => abortRef.current?.abort()} className="w-full">
              <Square className="w-3.5 h-3.5" /> 停止
            </Button>
          )}
        </div>

        {/* Right · Live stream */}
        <div className="space-y-3">
          {/* Skill 渐进披露 */}
          {skill && <SkillReveal skill={skill} />}

          {/* Iterations */}
          {iters.map((it) => (
            <IterCard key={it.iter} it={it} />
          ))}

          {/* Answer */}
          {answer && (
            <div className="rounded-xl border border-success bg-success-tint/40 p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-success">Final Answer</span>
                {done && <Badge variant="success" className="text-[10px]">{totalMs}ms · done</Badge>}
              </div>
              <div className="text-[13.5px] leading-relaxed text-ink whitespace-pre-wrap">
                {answer}
                {running && <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse" />}
              </div>
            </div>
          )}

          {iters.length === 0 && !answer && !running && (
            <div className="rounded-xl border border-dashed border-border p-14 text-center">
              <Sparkles className="w-8 h-8 text-ink-mute mx-auto mb-3" />
              <div className="text-[13px] text-ink-soft mb-1">点击左侧「发起 Live Run」开始</div>
              <div className="text-[11.5px] text-ink-mute">
                看到 ReAct 每次循环的 Thought / Action / Observation
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function SkillReveal({ skill }: { skill: SkillReveal }) {
  const [bodyOpen, setBodyOpen] = useState(true);
  const levels = [
    { level: 1, label: "frontmatter", loaded: Boolean(skill.meta), color: "bg-success" },
    { level: 2, label: "body", loaded: Boolean(skill.body), color: "bg-primary" },
    { level: 3, label: "scripts", loaded: skill.scripts.length > 0, color: "bg-accent" },
  ];
  return (
    <div className="rounded-xl border border-skill/30 bg-[hsl(320_50%_98%)] overflow-hidden">
      <div className="px-5 py-3 border-b border-skill/20 flex items-center gap-2">
        <Puzzle className="w-4 h-4 text-skill" />
        <span className="font-mono text-[13px] font-semibold text-skill">{skill.name}</span>
        <Badge variant="outline" className="text-[9px] text-skill border-skill/40 ml-auto">
          <Sparkles className="w-2.5 h-2.5" /> Skill 3 层渐进披露
        </Badge>
      </div>

      {/* Level indicator · 流水线 */}
      <div className="px-5 py-4 border-b border-skill/20 bg-surface/60">
        <div className="flex items-center gap-2">
          {levels.map((l, i) => (
            <div key={l.level} className="flex items-center gap-2 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-mono font-bold transition-all ${
                  l.loaded
                    ? `${l.color} text-white shadow-md`
                    : "bg-elevated text-ink-mute border border-border"
                }`}
              >
                {l.level}
              </div>
              <div className="flex-1">
                <div className={`text-[11px] font-mono ${l.loaded ? "text-ink font-medium" : "text-ink-mute"}`}>
                  Level {l.level} · {l.label}
                </div>
                {l.loaded && <div className="text-[10px] text-success font-mono">✓ loaded</div>}
              </div>
              {i < levels.length - 1 && (
                <div className={`h-0.5 w-6 rounded ${l.loaded ? "bg-success" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Level 1 · meta */}
      {skill.meta && (
        <div className="px-5 py-3 border-b border-skill/15">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 rounded bg-success text-white font-mono text-[9px] flex items-center justify-center">1</div>
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-ink-mute">Level 1 · Frontmatter(always)</span>
          </div>
          <div className="font-mono text-[11.5px] text-ink-soft bg-elevated/50 rounded p-2 leading-relaxed">
            <div>name: <span className="text-primary">{skill.meta.name}</span></div>
            <div>description: {skill.meta.description}</div>
            <div>version: {skill.meta.version}</div>
          </div>
        </div>
      )}

      {/* Level 2 · body */}
      {skill.body && (
        <div className="px-5 py-3 border-b border-skill/15">
          <button
            onClick={() => setBodyOpen((o) => !o)}
            className="flex items-center gap-2 mb-2 w-full text-left"
          >
            {bodyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <div className="w-4 h-4 rounded bg-primary text-white font-mono text-[9px] flex items-center justify-center">2</div>
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-ink-mute">
              Level 2 · Body(on trigger)
            </span>
            <Badge variant="info" className="text-[9px] ml-auto"><Eye className="w-2.5 h-2.5" /> loaded</Badge>
          </button>
          {bodyOpen && (
            <pre className="font-mono text-[11px] text-ink-soft bg-elevated/50 rounded p-3 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
              {skill.body}
            </pre>
          )}
        </div>
      )}

      {/* Level 3 · scripts invoked */}
      {skill.scripts.length > 0 ? (
        <div className="px-5 py-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 rounded bg-accent text-white font-mono text-[9px] flex items-center justify-center">3</div>
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-ink-mute">Level 3 · Scripts invoked</span>
          </div>
          <ul className="space-y-1">
            {skill.scripts.map((s) => (
              <li key={s} className="flex items-center gap-2 font-mono text-[11.5px] text-ink">
                <FileCode className="w-3 h-3 text-accent" />
                {s}
                <Badge variant="success" className="text-[9px]">invoked</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="px-5 py-3 text-[11px] font-mono text-ink-mute italic">
          Level 3 尚未触发 · 如 ReAct 选择 read_skill_script · 这里会实时显示
        </div>
      )}
    </div>
  );
}

function IterCard({ it }: { it: Iter }) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-2.5 border-b border-border-subtle flex items-center gap-2">
        <Badge variant="mono" className="text-[10px]">Iter {it.iter}</Badge>
        <span className="text-[10px] text-ink-mute font-mono uppercase tracking-wider">ReAct cycle</span>
      </div>

      {/* Thought */}
      <Section title="Thought" icon={Brain} color="text-info" border="border-info/30" bg="bg-info-tint/40">
        {it.thought ? (
          <pre className="font-mono text-[12px] text-ink-soft whitespace-pre-wrap leading-relaxed">
            {it.thought}
            {!it.thoughtDone && <span className="inline-block w-1 h-3 bg-info ml-0.5 animate-pulse" />}
          </pre>
        ) : (
          <div className="text-[11px] text-ink-mute font-mono">…</div>
        )}
      </Section>

      {/* Action */}
      {it.action && (
        <Section title="Action" icon={Wrench} color="text-tool" border="border-tool/30" bg="bg-tool-tint">
          <div className="font-mono text-[12px]">
            <span className="text-tool font-semibold">{it.action.name}</span>
            <span className="text-ink-mute">(</span>
            <pre className="inline text-ink-soft">{JSON.stringify(it.action.args, null, 2)}</pre>
            <span className="text-ink-mute">)</span>
          </div>
        </Section>
      )}

      {/* Tool call output */}
      {it.toolOutput !== undefined && (
        <Section
          title={`Observation${it.toolMs ? ` · ${it.toolMs}ms` : ""}`}
          icon={Eye}
          color="text-mcp"
          border="border-mcp/30"
          bg="bg-[hsl(155_50%_97%)]"
        >
          <pre className="font-mono text-[11.5px] text-ink-soft whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {it.toolOutput}
          </pre>
        </Section>
      )}

      {it.skillScript && (
        <div className="px-5 py-2 border-t border-accent/30 bg-accent-tint/40 flex items-center gap-2 text-[11px] font-mono">
          <FileCode className="w-3 h-3 text-accent" />
          <span className="text-ink-soft">Level 3 skill script invoked:</span>
          <code className="text-accent font-semibold">{it.skillScript}</code>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  color,
  border,
  bg,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  border: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`px-5 py-3 border-l-2 ${border} ${bg}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3 h-3 ${color}`} strokeWidth={2} />
        <span className={`text-[10px] font-mono font-semibold uppercase tracking-[0.14em] ${color}`}>{title}</span>
      </div>
      {children}
    </div>
  );
}
