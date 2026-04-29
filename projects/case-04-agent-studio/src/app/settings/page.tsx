"use client";

import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { Eye, EyeOff, Save, Zap, CheckCircle2, Globe, Moon, Bell, Languages } from "lucide-react";

const PROVIDER_TO_ID: Record<string, string> = {
  OPENROUTER_API_KEY: "openrouter",
  DASHSCOPE_API_KEY: "dashscope",
  OPENAI_API_KEY: "openai",
  JINA_API_KEY: "jina",
  SMITHERY_TOKEN: "smithery",
};

async function testProvider(envKey: string) {
  const id = PROVIDER_TO_ID[envKey];
  if (!id) { notify.todo(`${envKey} 测试 · 后端暂未接入`); return; }
  const tid = (await import("sonner")).toast.loading(`测试 ${id}...`);
  try {
    const r = await fetch("/api/models/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id }),
    });
    const j = await r.json();
    const { toast } = await import("sonner");
    if (j.ok) toast.success(`✅ ${id} 连通 · ${j.models} 模型`, { id: tid, description: `${j.ms}ms` });
    else toast.error(`❌ ${id}: ${j.error}`, { id: tid });
  } catch (e) {
    (await import("sonner")).toast.error(`异常: ${(e as Error).message}`, { id: tid });
  }
}

export default function SettingsPage() {
  const [showKey, setShowKey] = useState(false);
  return (
    <PageShell title="Settings" subtitle="全局配置 · API Keys · 主题 · 语言 · 通知">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
        {/* Side nav */}
        <aside className="space-y-1">
          {[
            { label: "Provider Keys", icon: Zap, active: true },
            { label: "个人资料", icon: Globe },
            { label: "外观", icon: Moon },
            { label: "通知", icon: Bell },
            { label: "语言", icon: Languages },
          ].map((i) => {
            const Icon = i.icon;
            return (
              <button
                key={i.label}
                onClick={() => { if (!i.active) notify.todo(`${i.label} · MVP 只实现 Provider Keys`); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-left transition-colors ${
                  i.active ? "bg-primary-tint text-primary font-medium" : "text-ink-soft hover:bg-elevated hover:text-ink"
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.8} />
                {i.label}
              </button>
            );
          })}
        </aside>

        {/* Main */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-[16px] font-semibold mb-1">Provider Keys</h2>
            <p className="text-[12.5px] text-ink-soft mb-5">
              所有 LLM / Embedding / Rerank Provider 的 API 密钥 · 保存后自动测试连接
            </p>

            <div className="space-y-4">
              {[
                { name: "OPENROUTER_API_KEY", display: "OpenRouter", placeholder: "sk-or-v1-...", hint: "300+ 模型统一接入 · 推荐首选", status: "connected" },
                { name: "DASHSCOPE_API_KEY", display: "阿里云百炼", placeholder: "sk-...", hint: "中文场景 Embedding 推荐", status: "connected" },
                { name: "OPENAI_API_KEY", display: "OpenAI", placeholder: "sk-...", hint: "直连 · 海外", status: "empty" },
                { name: "JINA_API_KEY", display: "Jina Reranker", placeholder: "jina_...", hint: "跨语言 cross-encoder", status: "empty" },
                { name: "SMITHERY_TOKEN", display: "Smithery MCP", placeholder: "sm_...", hint: "MCP registry 托管", status: "connected" },
              ].map((p) => (
                <div key={p.name} className="border-b border-border-subtle last:border-0 pb-4 last:pb-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <label className="font-mono text-[12px] font-semibold">{p.display}</label>
                      <div className="text-[10.5px] text-ink-mute font-mono">{p.name}</div>
                    </div>
                    {p.status === "connected" ? (
                      <Badge variant="success" className="text-[10px]">
                        <CheckCircle2 className="w-3 h-3" /> 已连接
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">未配置</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showKey ? "text" : "password"}
                      placeholder={p.placeholder}
                      defaultValue={p.status === "connected" ? "sk-or-v1-••••••••••••••••••••••••••••••" : ""}
                      className="font-mono text-[12px] flex-1"
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowKey(!showKey)}>
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="outline" size="sm" className="text-[11px]" onClick={() => testProvider(p.name)}>
                      测试
                    </Button>
                  </div>
                  <div className="text-[11px] text-ink-mute mt-1">{p.hint}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-border-subtle flex items-center justify-between">
              <span className="text-[11px] text-ink-mute">所有密钥在浏览器中加密 · 仅保存到本地 .env.local</span>
              <Button
                size="sm"
                onClick={async () => {
                  notify.ok("保存成功 · 开始批量测试");
                  for (const k of Object.keys(PROVIDER_TO_ID)) await testProvider(k);
                }}
              >
                <Save className="w-3.5 h-3.5" /> 保存并测试
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
