#!/usr/bin/env node
/**
 * verify-sse.mjs · SSE 端到端验收
 *
 * 规范（feedback_sse_verification.md）：
 *   ✓ 消费完整 stream · 不 | head
 *   ✓ 终态事件必须到达 (run_done)
 *   ✓ 核心 payload 不为空 · 至少 3 条
 *   ✓ 全 10 种事件类型覆盖
 *   ✓ 无 error 事件
 *   ✗ 不在 HTTP header 放中文（undici 会 throw）
 *
 * 使用：
 *   node scripts/verify-sse.mjs [--base http://127.0.0.1:3333] [--speed 8]
 *
 * 退出码：
 *   0 = 通过  · 1 = 失败  · 2 = 服务未启动
 */

const BASE = getArg("--base") ?? "http://127.0.0.1:3333";
const SPEED = Number(getArg("--speed") ?? "8");
const TIMEOUT_MS = 30_000;

const REQUIRED_TYPES = [
  "run_started",
  "step_start",
  "thought",
  "tool_call",
  "tool_result",
  "artifact",
  "step_done",
  "approval_required",
  "approved",
  "run_done",
];

const MIN_COUNT = {
  thought: 3,
  tool_call: 3,
  tool_result: 3,
  artifact: 3,
};

const log = (...x) => console.log(...x);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => console.log(`  ✗ ${msg}`);

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function ensureServerReady() {
  try {
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(r.status);
    return true;
  } catch {
    console.error(`❌ dev server 未就绪: ${BASE}/api/health`);
    return false;
  }
}

async function createRun() {
  const r = await fetch(`${BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario: "ecom-dm", speed: SPEED, auto_play: true }),
  });
  if (!r.ok) throw new Error(`POST /api/runs → ${r.status}`);
  return r.json();
}

async function approve(runId) {
  const r = await fetch(`${BASE}/api/runs/${runId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
  return r.ok;
}

async function consumeSse(runId, { autoApprove = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const events = [];
  const errors = [];

  let approvalPosted = false;

  try {
    const r = await fetch(`${BASE}/api/runs/${runId}/events`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });
    if (!r.ok) throw new Error(`SSE → ${r.status}`);

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // 解析 SSE 行
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const ev = JSON.parse(payload);
          events.push(ev);
          if (ev.type === "error") errors.push(ev);
          if (ev.type === "approval_required" && autoApprove && !approvalPosted) {
            approvalPosted = true;
            // 异步 · 不阻塞流
            approve(runId).catch((e) => errors.push({ type: "approve_failed", e }));
          }
          if (ev.type === "run_done") {
            controller.abort(); // 收到终态 · 主动断
            break;
          }
        } catch (e) {
          errors.push({ type: "parse_error", raw: payload, e: String(e) });
        }
      }
      if (events.some((e) => e.type === "run_done")) break;
    }
  } catch (e) {
    if (e.name !== "AbortError") errors.push({ type: "stream_error", e: String(e) });
  } finally {
    clearTimeout(timer);
  }

  return { events, errors };
}

(async () => {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("  SSE 验收 · FF-Autopilot /api/runs/:id/events");
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log(`  base=${BASE} · speed=${SPEED}x · timeout=${TIMEOUT_MS}ms`);
  log("");

  if (!(await ensureServerReady())) process.exit(2);
  ok("dev server /api/health 就绪");

  const run = await createRun();
  ok(`创建 run: ${run.id}`);

  const { events, errors } = await consumeSse(run.id, { autoApprove: true });
  log(`\n  消费到 ${events.length} 个事件 · ${errors.length} 个错误`);

  // checklist
  log("\n  ─ 事件类型覆盖 ─");
  const counts = Object.create(null);
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  let typeMissing = false;
  for (const t of REQUIRED_TYPES) {
    if (counts[t]) ok(`${t} × ${counts[t]}`);
    else {
      fail(`missing: ${t}`);
      typeMissing = true;
    }
  }

  log("\n  ─ 核心 payload 计数阈值 ─");
  let countShortage = false;
  for (const [t, min] of Object.entries(MIN_COUNT)) {
    const c = counts[t] ?? 0;
    if (c >= min) ok(`${t} ≥ ${min}: 实际 ${c}`);
    else {
      fail(`${t} 期望 ≥ ${min}，实际 ${c}`);
      countShortage = true;
    }
  }

  log("\n  ─ 终态 ─");
  const hasRunDone = !!counts.run_done;
  if (hasRunDone) ok("run_done 已收到 · 流闭合正常");
  else fail("run_done 未出现 · 流未闭合");

  log("\n  ─ error 事件 ─");
  if (errors.length === 0) ok("零 error");
  else {
    for (const e of errors.slice(0, 3)) fail(JSON.stringify(e).slice(0, 120));
  }

  const pass =
    !typeMissing &&
    !countShortage &&
    hasRunDone &&
    errors.length === 0;

  log("");
  log(pass ? "✅ ALL CHECKS PASSED" : "❌ FAILED");
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
