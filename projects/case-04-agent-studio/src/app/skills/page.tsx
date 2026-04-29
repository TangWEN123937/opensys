"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import {
  Puzzle,
  Search,
  Plus,
  Download,
  Trash2,
  Sparkles,
  CheckCircle2,
  Circle,
  FileText,
  Copy,
  Star,
  Play,
  Eye,
  FileCode,
  ChevronRight,
} from "lucide-react";

interface Skill {
  id: string;
  name: string;
  author: string;
  version: string;
  category: string;
  description: string;
  verified: boolean;
  raw?: string;
}

// 演示 fallback · 真 API 失败或 0 条时用
const DEMO_SKILLS: Skill[] = [
  { id: "pdf-extract", name: "pdf-extract", author: "anthropic", version: "2.1.0", category: "data", description: "Extract form fields / tables / images from PDF.", verified: true },
  { id: "excel-formula", name: "excel-formula", author: "anthropic", version: "1.3.2", category: "data", description: "生成和解释 Excel 公式.", verified: true },
  { id: "blog-writer", name: "blog-writer", author: "community", version: "2.0.0", category: "content", description: "企业博客风格模板.", verified: false },
  { id: "kpi-analyst", name: "kpi-analyst", author: "fufankeji", version: "1.2.0", category: "analysis", description: "KPI 自动分析.", verified: true },
];

export default function SkillsHubPage() {
  const [skills, setSkills] = useState<Skill[]>(DEMO_SKILLS);
  const [installed, setInstalled] = useState<string[]>([]);
  const [real, setReal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Skill>(DEMO_SKILLS[0]);

  const load = async () => {
    try {
      const r = await fetch("/api/skills");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (j.skills?.length > 0) {
        setSkills(j.skills);
        setInstalled(j.installed ?? []);
        setReal(true);
        setSelected(j.skills[0]);
      }
    } catch {
      setReal(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleInstall = async (name: string) => {
    if (!real) return;
    const isIn = installed.includes(name);
    const r = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: isIn ? "uninstall" : "install", name }),
    });
    const j = await r.json();
    if (j.ok) setInstalled(j.installed);
  };

  const installedCount = installed.length || (real ? 0 : 1);

  return (
    <PageShell
      title="Skills Hub"
      subtitle={`Agent Skills 市场 · ${installedCount} / ${skills.length} 已安装 · ${real ? "真 · /api/skills" : "演示数据"}`}
      actions={
        <>
          <Badge variant={real ? "success" : "warning"} className="text-[10px]">
            {real ? "● 真数据" : "◯ 演示数据"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => notify.todo("新建 Skill · 本地 SKILL.md 脚手架")}>
            <Plus className="w-3.5 h-3.5" /> 新建 Skill
          </Button>
          <Button size="sm" onClick={() => notify.todo("Prompt → Skill 自动生成 · 走 Claude + 保存到 .skills/")}>
            <Sparkles className="w-3.5 h-3.5" /> 从 prompt 生成
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 h-[calc(100vh-56px-48px)]">
        <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border-subtle">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-mute" />
              <input placeholder="搜索 skill..." className="w-full h-9 pl-9 pr-3 text-[13px] rounded-md border border-border bg-surface focus:outline-none focus:border-primary/40" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {skills.map((s) => {
              const isInstalled = installed.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className={`text-left rounded-lg border p-4 transition-all ${
                    selected.id === s.id
                      ? "border-primary bg-primary-tint/40 shadow-sm"
                      : "border-border bg-surface hover:bg-elevated/50 hover:border-ink-mute"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-skill/10 text-skill flex items-center justify-center shrink-0">
                        <Puzzle className="w-4 h-4" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[13px] font-semibold truncate">{s.name}</span>
                          {s.verified && <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />}
                        </div>
                        <div className="text-[11px] text-ink-mute font-mono truncate">{s.author} · v{s.version}</div>
                      </div>
                    </div>
                    {isInstalled ? (
                      <Badge variant="success" className="text-[10px] shrink-0">已装</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] shrink-0">未装</Badge>
                    )}
                  </div>
                  <p className="text-[12px] text-ink-soft leading-relaxed line-clamp-2 mb-3 min-h-[32px]">{s.description}</p>
                  <div className="flex items-center justify-between text-[10.5px] text-ink-mute font-mono">
                    <Badge variant="outline" className="text-[9px]">{s.category}</Badge>
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleInstall(s.id); }}
                      className={`flex items-center gap-1 cursor-pointer ${isInstalled ? "text-danger" : "text-primary font-medium"}`}
                    >
                      {isInstalled ? <><Trash2 className="w-3 h-3" /> 卸载</> : <><Plus className="w-3 h-3" /> 安装</>}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right · detail */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-lg bg-skill/10 text-skill flex items-center justify-center">
                <Puzzle className="w-5 h-5" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold font-mono">{selected.name}</h3>
                  {selected.verified && <Badge variant="success" className="text-[10px]">Verified</Badge>}
                </div>
                <div className="text-[11px] text-ink-mute font-mono mt-0.5">{selected.author} / {selected.name} · v{selected.version}</div>
              </div>
            </div>
            <p className="text-[12.5px] text-ink-soft leading-relaxed mb-4">{selected.description}</p>
            <Button
              size="sm"
              variant={installed.includes(selected.id) ? "danger" : "default"}
              onClick={() => toggleInstall(selected.id)}
              disabled={!real}
              className="w-full"
            >
              {installed.includes(selected.id) ? <><Trash2 className="w-3.5 h-3.5" /> 卸载</> : <><Download className="w-3.5 h-3.5" /> 安装到当前 Agent</>}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 3 层渐进披露可视化 */}
            <div>
              <label className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-skill" /> Progressive Disclosure · 3 层懒加载
              </label>
              <ProgressiveReveal skill={selected} />
            </div>

            {/* SKILL.md 原文 */}
            <div>
              <label className="text-[10px] font-semibold tracking-[0.14em] uppercase text-ink-mute mb-2 flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> SKILL.md(raw)
              </label>
              <pre className="rounded-md border border-border-subtle bg-elevated/50 p-3 text-[11px] font-mono text-ink-soft leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                {selected.raw ?? `---\nname: ${selected.name}\ndescription: ${selected.description}\nversion: ${selected.version}\n---\n\n# ${selected.name}\n\n[demo 数据 · 原 SKILL.md 未载入]`}
              </pre>
            </div>

            {/* Live Run CTA */}
            <Link href={`/run/live?useSkill=${selected.id}`} className="block">
              <div className="rounded-lg border border-primary/40 bg-primary-tint/50 p-3.5 hover:bg-primary-tint transition-colors cursor-pointer flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                  <Play className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-primary">Live Run with {selected.name}</div>
                  <div className="text-[11px] text-ink-soft mt-0.5">真跑一遍 · 看 ReAct 每步 + 3 层披露动画</div>
                </div>
                <ChevronRight className="w-4 h-4 text-primary" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function ProgressiveReveal({ skill }: { skill: Skill }) {
  const [level2, setLevel2] = useState(false);
  const [level3, setLevel3] = useState(false);
  const body = skill.raw
    ? skill.raw.replace(/^---[\s\S]*?---\n?/, "").trim()
    : `# ${skill.name}\n\nbody 文本未载入`;
  const scripts = ["scripts/parse.py", "scripts/ocr.py", "templates/forms.md"];

  return (
    <div className="space-y-2">
      {/* Level 1 · always loaded */}
      <div className="rounded-lg border border-success/30 bg-success-tint/40 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded bg-success text-white text-[10px] font-mono font-bold flex items-center justify-center">1</div>
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-success">Frontmatter</span>
          <Badge variant="success" className="text-[9px] ml-auto">always loaded</Badge>
        </div>
        <div className="font-mono text-[11px] text-ink-soft bg-surface rounded p-2 leading-relaxed">
          <div>name: <span className="text-primary font-semibold">{skill.name}</span></div>
          <div>description: {skill.description}</div>
          <div>version: {skill.version}</div>
          {skill.verified && <div>verified: <span className="text-success">true</span></div>}
        </div>
        <p className="text-[10.5px] text-ink-mute mt-2 italic">
          ✓ Agent 初始化时即加载到 system prompt · ≈ 20 tokens
        </p>
      </div>

      {/* Level 2 · on trigger */}
      <div className={`rounded-lg border ${level2 ? "border-info/40 bg-info-tint/40" : "border-dashed border-border"} p-3 transition-all`}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-5 h-5 rounded text-[10px] font-mono font-bold flex items-center justify-center ${level2 ? "bg-info text-white" : "bg-elevated text-ink-mute"}`}>2</div>
          <span className={`text-[11px] font-mono font-semibold uppercase tracking-wider ${level2 ? "text-info" : "text-ink-mute"}`}>Body · on trigger</span>
          {level2 ? (
            <Badge variant="info" className="text-[9px] ml-auto"><Eye className="w-2.5 h-2.5" /> loaded</Badge>
          ) : (
            <button
              onClick={() => { setLevel2(true); notify.ok("Level 2 body 已触发加载"); }}
              className="ml-auto text-[10.5px] text-primary font-medium hover:underline"
            >
              触发加载 →
            </button>
          )}
        </div>
        {level2 ? (
          <pre className="font-mono text-[11px] text-ink-soft bg-surface rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
            {body}
          </pre>
        ) : (
          <p className="text-[10.5px] text-ink-mute italic">
            ○ 仅当 Agent 判断需要 Skill 时加载 body 到 prompt · 节省上下文(~{Math.ceil(body.length / 4)} tokens)
          </p>
        )}
      </div>

      {/* Level 3 · on invoke */}
      <div className={`rounded-lg border ${level3 ? "border-accent/40 bg-accent-tint/40" : "border-dashed border-border"} p-3 transition-all`}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-5 h-5 rounded text-[10px] font-mono font-bold flex items-center justify-center ${level3 ? "bg-accent text-white" : "bg-elevated text-ink-mute"}`}>3</div>
          <span className={`text-[11px] font-mono font-semibold uppercase tracking-wider ${level3 ? "text-accent" : "text-ink-mute"}`}>Scripts & Templates · on invoke</span>
          {level3 ? (
            <Badge variant="accent" className="text-[9px] ml-auto"><FileCode className="w-2.5 h-2.5" /> invoked</Badge>
          ) : (
            <button
              onClick={() => { setLevel3(true); notify.ok("Level 3 script 被调用", "read_skill_script(parse.py)"); }}
              className="ml-auto text-[10.5px] text-primary font-medium hover:underline"
            >
              模拟 invoke →
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {scripts.map((s) => (
            <li key={s} className="flex items-center gap-2 font-mono text-[11px]">
              {level3 ? (
                <>
                  <FileCode className="w-3 h-3 text-accent" />
                  <span className="text-ink">{s}</span>
                  <Badge variant="success" className="text-[9px] ml-auto">loaded</Badge>
                </>
              ) : (
                <>
                  <Circle className="w-3 h-3 text-ink-mute" />
                  <span className="text-ink-mute">{s}</span>
                  <span className="ml-auto text-[9px] text-ink-mute">待触发</span>
                </>
              )}
            </li>
          ))}
        </ul>
        {!level3 && (
          <p className="text-[10.5px] text-ink-mute mt-2 italic">
            ○ 仅当 Agent 主动调用 <code className="bg-elevated px-1 rounded">read_skill_script</code> 工具才加载 · 零上下文占用
          </p>
        )}
      </div>
    </div>
  );
}
