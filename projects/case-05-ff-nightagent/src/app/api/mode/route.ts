import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 当前运行模式 · 前端根据这个决定是否展示"演示数据" badge
 * 无 ANTHROPIC_API_KEY → mock · 有 key → real（但本 MVP 仍走脚本，只是 badge 切 real）
 */
export async function GET() {
  const openrouter = (process.env.OPENROUTER_API_KEY ?? "").startsWith("sk-");
  const anthropic = (process.env.ANTHROPIC_API_KEY ?? "").startsWith("sk-");
  const hasKey = openrouter || anthropic;
  return NextResponse.json({
    mode: hasKey ? "real" : "mock",
    provider: openrouter ? "openrouter" : anthropic ? "anthropic" : null,
    model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5",
    reason: openrouter
      ? "已连 OpenRouter · 真调 Claude"
      : anthropic
      ? "已配 ANTHROPIC_API_KEY · 真调 Claude 原生 API"
      : "未配 key · 走合成 mock",
    has_key: hasKey,
  });
}
