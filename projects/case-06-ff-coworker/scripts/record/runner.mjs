#!/usr/bin/env node
/**
 * Playwright 录制驱动 · headed Chromium + recordVideo + 虚拟鼠标 + 字幕
 *
 *   node scripts/record/runner.mjs scripts/record/scripts/hero-scroll.json
 *
 * 输出：
 *   artifacts/recordings/<timestamp>-<scriptname>.webm
 *   artifacts/recordings/<timestamp>-<scriptname>.mp4   （若装了 ffmpeg）
 */

import { chromium } from "playwright";
import { readFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { lintScript } from "./lint-subtitles.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

/* ─────────── CLI ─────────── */

const scriptArg = process.argv[2];
if (!scriptArg) {
  console.error("用法: node scripts/record/runner.mjs <script.json>");
  process.exit(1);
}
const scriptPath = resolve(scriptArg);
if (!existsSync(scriptPath)) {
  console.error("剧本文件不存在:", scriptPath);
  process.exit(1);
}
const script = JSON.parse(readFileSync(scriptPath, "utf8"));

const baseUrl = script.baseUrl || "http://localhost:3333";
const viewport = script.viewport || { width: 1440, height: 900 };
const slowMo = Number(process.env.RECORD_SLOWMO ?? script.slowMo ?? 0);

/* ─────────── 输出路径 ─────────── */

const ts = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "-")
  .slice(0, 19);
const tag = basename(scriptPath, ".json");
const outDir = join(repoRoot, "artifacts/recordings");
mkdirSync(outDir, { recursive: true });

/* ─────────── 注入 cursor + subtitle ─────────── */

const cursorCss = readFileSync(
  join(__dirname, "inject/cursor-overlay.css"),
  "utf8"
);
const cursorJs = readFileSync(
  join(__dirname, "inject/cursor-overlay.js"),
  "utf8"
);

/* ─────────── 字幕风格 lint · 违规拒跑 ─────────── */

const violations = lintScript(script);
if (violations.length > 0) {
  console.error(`\n❌ 字幕风格 lint 失败 · ${violations.length} 条违规\n`);
  for (const v of violations) {
    console.error(`  [${v.at || "#" + v.idx}] "${v.text}"`);
    for (const i of v.issues) console.error(`     · ${i.rule}: ${i.msg}`);
    console.error("");
  }
  console.error("→ 请按 scripts/record/SUBTITLE-STYLE.md 重写后再跑");
  console.error("→ 临时绕过：RECORD_SKIP_LINT=1 pnpm record:demo ...\n");
  if (process.env.RECORD_SKIP_LINT !== "1") process.exit(2);
  console.error("⚠️  RECORD_SKIP_LINT=1 · 已绕过 lint · 继续录制\n");
} else if (script.steps.some((s) => s.subtitle || s.action === "subtitle")) {
  console.log(`✅ 字幕风格 lint 通过 (${script.steps.filter(s => s.subtitle || s.action==="subtitle").length} 条字幕)\n`);
}

/* ─────────── 启动 Playwright ─────────── */

console.log(`🎬 ${script.name || tag}`);
console.log(`   base=${baseUrl}  viewport=${viewport.width}x${viewport.height}`);
console.log(`   steps=${script.steps.length}\n`);

const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
  slowMo,
  args: [
    "--disable-blink-features=AutomationControlled",
    "--no-default-browser-check",
  ],
});

const context = await browser.newContext({
  viewport,
  baseURL: baseUrl,
  recordVideo: { dir: outDir, size: viewport },
  deviceScaleFactor: 2, // 高清
});

await context.addInitScript({
  content: `
    window.__REC_CSS__ = ${JSON.stringify(cursorCss)};
    ${cursorJs}
  `,
});

const page = await context.newPage();

/* ─────────── 步骤执行器 ─────────── */

async function showSubtitle(text, holdMs) {
  // 等 cursor-overlay.js 在新 page 上 mount 完毕（navigate 后必备）
  await page.waitForFunction(() => !!window.__rec, null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(
    ({ t, h }) => window.__rec && window.__rec.showSubtitle(t, h),
    { t: text, h: holdMs ?? null }
  );
}

async function glideTo(x, y, steps = 30) {
  await page.mouse.move(x, y, { steps });
}

async function bboxCenter(selector) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: 10_000 });
  const box = await loc.boundingBox();
  if (!box) throw new Error(`无法取到 bbox: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function runStep(step, idx) {
  const tag = step.at ? `[${step.at}]` : `#${idx + 1}`;
  const sub = step.subtitle || (step.action === "subtitle" ? step.text : "");
  console.log(
    `${tag} ${step.action.padEnd(10)} ${sub ? "· " + sub : ""}`
  );

  // 字幕（如果该 step 带）—— 先显示，再做动作
  if (step.subtitle) {
    await showSubtitle(step.subtitle, step.subtitleHold ?? null);
  }

  switch (step.action) {
    case "navigate": {
      await page.goto(step.url, { waitUntil: "domcontentloaded" });
      // 等字体 + 第一波 hydration
      await page.waitForTimeout(step.settleMs ?? 600);
      break;
    }

    case "wait": {
      await page.waitForTimeout(step.ms ?? 1000);
      break;
    }

    case "subtitle": {
      // 仅显示字幕（无动作）· 用 hold 控制持续时间
      await showSubtitle(step.text, step.hold ?? null);
      await page.waitForTimeout(step.hold ?? 1500);
      break;
    }

    case "subtitleClear": {
      await showSubtitle("", 0);
      break;
    }

    case "scene": {
      /**
       * 字幕 + 视觉锚点的原子单元 · 强制同步
       *   1. 滚到 anchor (selector | {y} | {scrollBy})
       *   2. 等 settleMs (默认 400ms · 让 fade-up / 图片渲染完)
       *   3. 显示字幕 (hold 控制存活)
       *   4. 等 hold 时长再返回
       */
      const settleMs = step.settleMs ?? 400;
      const framing = step.framing ?? "center"; // 'center' | 'top'
      const dur = step.scrollDuration ?? 1200;

      // 1. scroll to anchor
      if (typeof step.anchor === "string") {
        // CSS selector
        await page.evaluate(
          ({ sel, framing, dur }) =>
            new Promise((resolve) => {
              const el = document.querySelector(sel);
              if (!el) {
                console.warn("[scene] anchor not found:", sel);
                resolve();
                return;
              }
              const rect = el.getBoundingClientRect();
              const absoluteTop = rect.top + window.scrollY;
              const targetY =
                framing === "top"
                  ? absoluteTop - 24
                  : absoluteTop - (window.innerHeight - rect.height) / 2;
              const startY = window.scrollY;
              const finalY = Math.max(0, targetY);
              const start = performance.now();
              const tick = (now) => {
                const t = Math.min(1, (now - start) / dur);
                const e = 1 - Math.pow(1 - t, 3);
                window.scrollTo(0, startY + (finalY - startY) * e);
                if (t < 1) requestAnimationFrame(tick);
                else resolve();
              };
              requestAnimationFrame(tick);
            }),
          { sel: step.anchor, framing, dur }
        );
      } else if (step.anchor && typeof step.anchor === "object") {
        const anchor = step.anchor;
        if (typeof anchor.y === "number") {
          await page.evaluate(
            ({ y, dur }) =>
              new Promise((resolve) => {
                const startY = window.scrollY;
                const start = performance.now();
                const tick = (now) => {
                  const t = Math.min(1, (now - start) / dur);
                  const e = 1 - Math.pow(1 - t, 3);
                  window.scrollTo(0, startY + (y - startY) * e);
                  if (t < 1) requestAnimationFrame(tick);
                  else resolve();
                };
                requestAnimationFrame(tick);
              }),
            { y: anchor.y, dur }
          );
        } else if (typeof anchor.scrollBy === "number") {
          await page.evaluate(
            ({ dy, dur }) =>
              new Promise((resolve) => {
                const startY = window.scrollY;
                const target = startY + dy;
                const start = performance.now();
                const tick = (now) => {
                  const t = Math.min(1, (now - start) / dur);
                  const e = 1 - Math.pow(1 - t, 3);
                  window.scrollTo(0, startY + (target - startY) * e);
                  if (t < 1) requestAnimationFrame(tick);
                  else resolve();
                };
                requestAnimationFrame(tick);
              }),
            { dy: anchor.scrollBy, dur }
          );
        }
      }

      // 2. settle · 让 fade-up 动画 / 图片渲染稳定
      await page.waitForTimeout(settleMs);

      // 3. 字幕（必填）
      if (step.subtitle) {
        const hold = step.hold ?? 6000;
        await showSubtitle(step.subtitle, hold);
        await page.waitForTimeout(hold);
      }
      break;
    }

    case "scrollTo": {
      // 绝对滚动到 y
      await page.evaluate(
        ({ y, dur }) =>
          new Promise((resolve) => {
            const startY = window.scrollY;
            const target = y;
            const start = performance.now();
            const tick = (now) => {
              const t = Math.min(1, (now - start) / dur);
              const e = 1 - Math.pow(1 - t, 3);
              window.scrollTo(0, startY + (target - startY) * e);
              if (t < 1) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          }),
        { y: step.y ?? 0, dur: step.duration ?? 1500 }
      );
      break;
    }

    case "scrollBy": {
      // 相对滚动
      await page.evaluate(
        ({ dy, dur }) =>
          new Promise((resolve) => {
            const startY = window.scrollY;
            const target = startY + dy;
            const start = performance.now();
            const tick = (now) => {
              const t = Math.min(1, (now - start) / dur);
              const e = 1 - Math.pow(1 - t, 3);
              window.scrollTo(0, startY + (target - startY) * e);
              if (t < 1) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          }),
        { dy: step.y ?? 0, dur: step.duration ?? 1500 }
      );
      break;
    }

    case "moveTo": {
      // 仅移动鼠标（不点）
      let x, y;
      if (step.selector) {
        ({ x, y } = await bboxCenter(step.selector));
      } else {
        x = step.x;
        y = step.y;
      }
      await glideTo(x, y, step.steps ?? 30);
      break;
    }

    case "click": {
      let x, y;
      if (step.selector) {
        ({ x, y } = await bboxCenter(step.selector));
      } else {
        x = step.x;
        y = step.y;
      }
      await glideTo(x, y, step.steps ?? 30);
      await page.waitForTimeout(step.preClickMs ?? 140);
      await page.mouse.click(x, y);
      break;
    }

    case "type": {
      const loc = page.locator(step.selector).first();
      await loc.waitFor({ state: "visible" });
      await loc.click();
      // 清空旧内容（多行 textarea 也兼容）
      await loc.press("ControlOrMeta+a");
      await loc.press("Delete");
      await loc.pressSequentially(step.text, { delay: step.speed ?? 80 });
      break;
    }

    case "waitFor": {
      await page
        .locator(step.selector)
        .first()
        .waitFor({ state: "visible", timeout: step.timeout ?? 15_000 });
      break;
    }

    default:
      console.warn(`  ⚠️  未知 action: ${step.action} · 跳过`);
  }
}

/* ─────────── 主循环 ─────────── */

let stepError = null;
const t0 = Date.now();
try {
  for (let i = 0; i < script.steps.length; i++) {
    await runStep(script.steps[i], i);
  }
  // 末尾留 1.2s 让最后一帧/字幕收尾
  await page.waitForTimeout(1200);
} catch (e) {
  stepError = e;
  console.error("\n❌ 步骤失败:", e.message);
}

const elapsedMs = Date.now() - t0;

/* ─────────── 收尾 + 转码 ─────────── */

const video = page.video();
await context.close();
await browser.close();

const rawPath = await video.path();
const targetWebm = join(outDir, `${ts}-${tag}.webm`);
renameSync(rawPath, targetWebm);
console.log(`\n✅ WebM: ${targetWebm}  (${(elapsedMs / 1000).toFixed(1)}s)`);

const speedup = Number(script.speedup ?? 1);
const ffmpegFound = spawnSync("which", ["ffmpeg"]).status === 0;
if (ffmpegFound) {
  const targetMp4 = targetWebm.replace(/\.webm$/, ".mp4");
  const filters = speedup > 1 ? ["-filter:v", `setpts=PTS/${speedup}`] : [];
  const tag = speedup > 1 ? ` (×${speedup} 加速)` : "";
  console.log(`🎞  ffmpeg 转码${tag} → ${basename(targetMp4)}`);
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i", targetWebm,
      ...filters,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-crf", "20",
      "-preset", "medium",
      "-movflags", "+faststart",
      "-an",
      targetMp4,
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  if (r.status === 0) console.log(`✅ MP4:  ${targetMp4}`);
  else console.warn("⚠️  ffmpeg 转码失败:", r.stderr?.toString().slice(-400));
} else {
  console.log("ℹ️  未发现 ffmpeg · 跳过 MP4 转码 (brew install ffmpeg)");
}

if (stepError) process.exit(2);
