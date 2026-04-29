// GET /api/models · 列 provider 状态 + 已配
// POST /api/models/test · { provider } · 连通测试

import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Provider {
  id: string;
  name: string;
  envKey: string;
  baseUrl: string;
  configured: boolean;
}

const PROVIDERS: Omit<Provider, "configured">[] = [
  { id: "openrouter", name: "OpenRouter", envKey: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "dashscope", name: "阿里云百炼", envKey: "DASHSCOPE_API_KEY", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "openai", name: "OpenAI", envKey: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  { id: "deepseek", name: "DeepSeek", envKey: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/v1" },
];

function isConfigured(envKey: string): boolean {
  const v = process.env[envKey];
  return Boolean(v && !v.includes("xxxxx"));
}

export async function GET() {
  const providers = PROVIDERS.map((p) => ({ ...p, configured: isConfigured(p.envKey) }));
  return Response.json({ providers });
}

export async function POST(req: Request) {
  const { provider } = (await req.json()) as { provider: string };
  const p = PROVIDERS.find((x) => x.id === provider);
  if (!p) return Response.json({ ok: false, error: "unknown provider" }, { status: 400 });
  if (!isConfigured(p.envKey)) return Response.json({ ok: false, error: `${p.envKey} 未配置` });

  const t0 = Date.now();
  try {
    // OpenAI 兼容 · 拉 /models
    const res = await fetch(`${p.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${process.env[p.envKey]}` },
    });
    if (!res.ok) {
      const txt = await res.text();
      await audit({ actor: "user", action: "provider.test", target: provider, meta: `status:${res.status}`, level: "error" });
      return Response.json({ ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 100)}`, ms: Date.now() - t0 });
    }
    const j = await res.json();
    const modelCount = j.data?.length ?? 0;
    await audit({ actor: "user", action: "provider.test", target: provider, meta: `models:${modelCount} ms:${Date.now() - t0}` });
    return Response.json({ ok: true, models: modelCount, ms: Date.now() - t0 });
  } catch (e) {
    await audit({ actor: "user", action: "provider.test", target: provider, meta: (e as Error).message, level: "error" });
    return Response.json({ ok: false, error: (e as Error).message, ms: Date.now() - t0 });
  }
}
