#!/usr/bin/env node
/**
 * 截图脚本 · 自动跑 case-06 全套核心场景，存到 _docs/screenshots/
 *
 * 使用：node scripts/capture-showcase.mjs
 * 前置：dev server 跑在 localhost:3210 + OPENROUTER_API_KEY 已配
 */

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "_docs/screenshots");
const URL_BASE = "http://localhost:3210";

const VIEWPORT = { width: 1440, height: 900 };

const log = (...a) => console.log("[capture]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.full ?? false });
  log(`✓ ${name}.png ${opts.full ? "(full)" : ""}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // retina
    locale: "zh-CN",
  });
  const page = await context.newPage();

  // ───── 1. 首页 hero ─────
  log("→ /");
  await page.goto(`${URL_BASE}/`, { waitUntil: "networkidle" });
  await sleep(800);
  await shoot(page, "01-home-hero");
  await shoot(page, "01-home-full", { full: true });

  // ───── 2. 办公室 全景 + 一键并行触发前 ─────
  log("→ /office (idle)");
  await page.goto(`${URL_BASE}/office`, { waitUntil: "networkidle" });
  await sleep(800);
  await shoot(page, "02-office-idle", { full: true });

  // ───── 3. 一键 6 路并发 ─────
  log("→ click 一键并行");
  await page.locator('[data-testid="run-orchestra"]').click();
  log("等 6 路并发跑 18 秒（早期高密度，能看到 phase 推进 + 工具栈滚动）");
  await sleep(18_000);
  await shoot(page, "03-orchestra-running", { full: true });

  // 让它跑到接近完成
  log("等到 50 秒（多数员工已完成 / 临近完成）");
  await sleep(32_000);
  await shoot(page, "04-orchestra-done", { full: true });

  // ───── 4. 单员工 LIVE · 陈昊 ─────
  log("→ /employee/alex");
  await page.goto(`${URL_BASE}/employee/alex`, { waitUntil: "networkidle" });
  await sleep(600);
  await shoot(page, "05-employee-alex-idle");

  log("点 派发任务 → 等 LIVE 徽章");
  await page.locator('[data-testid="run-agent"]').click();
  await page.getByText("🟢 LIVE").first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(8_000); // 让 phase 进入工具调用 + 多个机制亮起
  await shoot(page, "06-employee-alex-live-running");

  log("等 alex 跑完");
  await page.getByText("完成").first().waitFor({ state: "visible", timeout: 90_000 });
  await sleep(1_500);
  await shoot(page, "07-employee-alex-live-done", { full: true });

  // ───── 5. 单员工 LIVE · 沈墨（数据分析）做对比 ─────
  log("→ /employee/lucas");
  await page.goto(`${URL_BASE}/employee/lucas`, { waitUntil: "networkidle" });
  await sleep(600);
  await page.locator('[data-testid="run-agent"]').click();
  await page.getByText("🟢 LIVE").first().waitFor({ state: "visible", timeout: 20_000 });
  await sleep(10_000);
  await shoot(page, "08-employee-lucas-live");

  // ───── 6. 落地场景 ─────
  log("→ /scenarios");
  await page.goto(`${URL_BASE}/scenarios`, { waitUntil: "networkidle" });
  await sleep(800);
  await shoot(page, "09-scenarios-top");
  await shoot(page, "09-scenarios-full", { full: true });

  // ───── 7. 飞书指挥 ─────
  log("→ /feishu");
  await page.goto(`${URL_BASE}/feishu`, { waitUntil: "networkidle" });
  await sleep(800);
  await shoot(page, "10-feishu");

  await browser.close();
  log("done · 全部截图保存在 _docs/screenshots/");
}

main().catch((err) => {
  console.error("[capture] FATAL", err);
  process.exit(1);
});
