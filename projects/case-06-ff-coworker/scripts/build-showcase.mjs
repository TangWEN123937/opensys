#!/usr/bin/env node
/**
 * 构建单文件 showcase.html · base64 内嵌所有 webp 截图
 *
 * 使用：node scripts/build-showcase.mjs
 * 输出：_docs/showcase.html （≤ 5MB · 离线可发送）
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WEBP_DIR = path.join(ROOT, "_docs/screenshots/webp");
const OUT = path.join(ROOT, "_docs/showcase.html");

async function b64(name) {
  const buf = await fs.readFile(path.join(WEBP_DIR, `${name}.webp`));
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

const main = async () => {
  const img = {
    homeHero: await b64("01-home-hero"),
    homeFull: await b64("01-home-full"),
    officeIdle: await b64("02-office-idle"),
    orchestraRun: await b64("03-orchestra-running"),
    orchestraDone: await b64("04-orchestra-done"),
    alexIdle: await b64("05-employee-alex-idle"),
    alexRun: await b64("06-employee-alex-live-running"),
    alexDone: await b64("07-employee-alex-live-done"),
    lucasLive: await b64("08-employee-lucas-live"),
    scenariosTop: await b64("09-scenarios-top"),
    scenariosFull: await b64("09-scenarios-full"),
    feishu: await b64("10-feishu"),
  };

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FF-CoWorker · 一人公司 AI 员工系统 · 演示档</title>
<style>
  :root {
    --canvas: #FBF7F1;
    --paper:  #F4ECDF;
    --paper-2:#EBE2D2;
    --ink:    #2A2724;
    --ink-soft:#3F3A35;
    --ink-mid: #6B6560;
    --ink-lo:  #9A9490;
    --ink-hair:#E5E0D6;
    --warmth: #D97757;
    --warmth-deep: #B35A3F;
    --warmth-soft: rgba(217,119,87,0.12);
    --sage:   #7A9B7A;
    --sage-soft: rgba(122,155,122,0.14);
    --gold:   #C9A961;
    --shadow-md: 0 4px 14px rgba(42,39,36,.08);
    --shadow-lg: 0 18px 40px rgba(42,39,36,.10);
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: "Inter", "PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--canvas);
    color: var(--ink);
    line-height: 1.65;
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
  }
  .display { font-family: "Source Serif Pro", "Noto Serif SC", "Songti SC", serif; font-weight: 700; }
  .mono    { font-family: "JetBrains Mono", "SF Mono", Menlo, monospace; }

  .container { max-width: 1080px; margin: 0 auto; padding: 0 32px; }

  /* ─── 顶部 ─── */
  header {
    border-bottom: 1px solid var(--ink-hair);
    background: linear-gradient(180deg, var(--paper) 0%, var(--canvas) 100%);
    padding: 56px 0 72px;
  }
  .badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 14px; border-radius: 999px;
    background: var(--warmth-soft); color: var(--warmth-deep);
    font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
    font-weight: 600;
  }
  h1 { font-size: 56px; line-height: 1.1; margin: 24px 0 16px; letter-spacing: -0.02em; }
  h1 em { color: var(--warmth-deep); font-style: normal; }
  .lede { font-size: 20px; color: var(--ink-soft); max-width: 720px; line-height: 1.55; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; margin-top: 48px; padding-top: 32px; border-top: 1px solid var(--ink-hair); }
  .stat { padding: 0 16px; }
  .stat:not(:first-child) { border-left: 1px solid var(--ink-hair); }
  .stat-num { font-size: 30px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; font-family: "Source Serif Pro", serif; }
  .stat-label { font-size: 12px; color: var(--ink-mid); margin-top: 4px; letter-spacing: 0.05em; }

  /* ─── section ─── */
  section { padding: 80px 0; border-bottom: 1px solid var(--ink-hair); }
  .eyebrow { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--warmth-deep); font-weight: 700; margin-bottom: 12px; }
  h2 { font-size: 38px; line-height: 1.15; margin: 0 0 16px; letter-spacing: -0.01em; }
  h2 em { color: var(--warmth-deep); font-style: normal; border-bottom: 3px solid var(--warmth); padding-bottom: 2px; }
  .section-lead { font-size: 17px; color: var(--ink-mid); max-width: 720px; margin-bottom: 36px; }

  .figure { margin: 32px 0 12px; box-shadow: var(--shadow-lg); border-radius: 12px; overflow: hidden; border: 1px solid var(--ink-hair); }
  .figure img { display: block; width: 100%; height: auto; }
  .caption { font-size: 13px; color: var(--ink-mid); margin-top: 12px; padding-left: 4px; }
  .caption .mono { color: var(--ink-soft); }

  /* 双图并排 */
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 32px 0; }
  .row .figure { margin: 0; }

  /* 关键事实条 */
  .facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin: 36px 0; padding: 24px 0; background: var(--paper); border-radius: 12px; border: 1px solid var(--ink-hair); }
  .fact { padding: 8px 24px; }
  .fact:not(:first-child) { border-left: 1px solid var(--ink-hair); }
  .fact-num { font-size: 28px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; font-family: "Source Serif Pro", serif; }
  .fact-label { font-size: 12px; color: var(--ink-mid); margin-top: 4px; }

  /* 6 员工 chip */
  .chips { display: flex; flex-wrap: wrap; gap: 10px; margin: 24px 0; }
  .chip { padding: 6px 14px; border: 1px solid var(--ink-hair); background: var(--paper); border-radius: 999px; font-size: 13px; }
  .chip b { font-weight: 600; color: var(--ink); }
  .chip span { color: var(--ink-mid); margin-left: 6px; }

  /* 高亮块 */
  .quote {
    margin: 36px 0; padding: 28px 32px;
    background: var(--paper);
    border-left: 4px solid var(--warmth);
    border-radius: 4px;
    font-size: 18px; line-height: 1.55; color: var(--ink-soft);
    font-family: "Source Serif Pro", "Noto Serif SC", serif;
  }
  .quote cite { display: block; font-size: 12px; color: var(--ink-mid); margin-top: 14px; font-style: normal; letter-spacing: 0.05em; text-transform: uppercase; font-family: "JetBrains Mono", monospace; }

  /* mode 徽章示意 */
  .pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-family: "JetBrains Mono", monospace; letter-spacing: 0.12em; text-transform: uppercase; border: 1px solid; }
  .pill-live { background: var(--sage-soft); border-color: var(--sage); color: var(--sage); }
  .pill-demo { background: var(--warmth-soft); border-color: var(--warmth); color: var(--warmth-deep); }

  ul.checks { padding-left: 20px; line-height: 1.85; color: var(--ink-soft); }
  ul.checks li::marker { color: var(--sage); }
  ul.checks li { margin-bottom: 4px; }

  footer {
    background: var(--ink); color: var(--canvas);
    padding: 48px 0 36px;
    font-size: 13px; line-height: 1.7;
  }
  footer h3 { font-size: 16px; margin: 0 0 12px; color: var(--canvas); letter-spacing: 0.05em; }
  footer .container { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 32px; }
  footer p, footer li { color: rgba(251,247,241,0.7); }
  footer ul { padding-left: 18px; margin: 0; }
  footer .meta { color: rgba(251,247,241,0.45); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; padding-top: 24px; margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; }

  /* 响应式 */
  @media (max-width: 720px) {
    .container { padding: 0 20px; }
    h1 { font-size: 38px; }
    h2 { font-size: 26px; }
    .stats { grid-template-columns: repeat(2, 1fr); gap: 24px 0; }
    .stat:nth-child(odd) { border-left: 0; }
    .row { grid-template-columns: 1fr; gap: 16px; }
    .facts { grid-template-columns: 1fr; }
    .fact { padding: 12px 24px; }
    .fact:not(:first-child) { border-left: 0; border-top: 1px solid var(--ink-hair); }
    footer .container { grid-template-columns: 1fr; gap: 24px; }
  }
</style>
</head>
<body>

<header>
  <div class="container">
    <span class="badge">Case 06 · 演示档</span>
    <h1 class="display">
      一个老板 · <em>6 个 AI 员工</em> ·<br>
      抵一个 ¥150 万/年 团队
    </h1>
    <p class="lede">
      基于 <b>Hermes Agent</b>（Nous Research 出品）+ Anthropic Context Engineering 8 大机制，
      把多 Agent 协作工程化。本 demo 真接 Claude Sonnet 4.6，所有 token 数字、工具调用、PR 编号
      都是 LLM 现场推理产物 —— 不在剧本里。
    </p>
    <div class="stats">
      <div class="stat">
        <div class="stat-num">6 / 1</div>
        <div class="stat-label">AI 员工 / 真人老板</div>
      </div>
      <div class="stat">
        <div class="stat-num">7×24</div>
        <div class="stat-label">在岗 · 不打烊</div>
      </div>
      <div class="stat">
        <div class="stat-num">¥128 / 天</div>
        <div class="stat-label">全员 AI 成本</div>
      </div>
      <div class="stat">
        <div class="stat-num">¥3 亿+</div>
        <div class="stat-label">一人公司年营收上限</div>
      </div>
    </div>
  </div>
</header>

<section>
  <div class="container">
    <div class="eyebrow">01 · 走进办公室</div>
    <h2>这就是一个一人公司的<em>办公室俯视图</em></h2>
    <p class="section-lead">中央空椅子是老板 —— 你可以在任何地方。周围 6 个 AI 员工各占一个工位，
      每个工位代表一个独立 context 的 sub-agent。</p>

    <div class="chips">
      <div class="chip"><b>陈昊</b><span>· CTO · 微信生态</span></div>
      <div class="chip"><b>林夏</b><span>· 创意 · 小红书 / 抖音</span></div>
      <div class="chip"><b>苏雯</b><span>· 客服 · 抖店 / 小红书 / 企微</span></div>
      <div class="chip"><b>沈墨</b><span>· 数据 · 飞书日报</span></div>
      <div class="chip"><b>江雨</b><span>· 销售 · 私域 + 出海</span></div>
      <div class="chip"><b>罗川</b><span>· 运维 · 阿里云 / 腾讯云</span></div>
    </div>

    <div class="figure">
      <img src="${img.officeIdle}" alt="办公室俯视图 · 6 工位">
    </div>
    <div class="caption">/office · 等距俯视图。每个头像背后是一个独立 sub-agent · 中央是老板小王空座。</div>
  </div>
</section>

<section>
  <div class="container">
    <div class="eyebrow">02 · 视觉爆点</div>
    <h2>一键 · <em>6 路真 LLM 并发</em>跑一天的活</h2>
    <p class="section-lead">这不是顺序排队，不是录像，不是脚本 —— 是 6 个 Claude Sonnet 4.6 实例
      同时在跑。底层 Hermes 的 <code class="mono">tools/delegate_tool.py:798</code>
      ThreadPoolExecutor 真并发。</p>

    <div class="figure">
      <img src="${img.orchestraRun}" alt="6 路并发运行中">
    </div>
    <div class="caption">/office · 点击「▶ 一键运行一天」18 秒后画面：6 卡格各自跑工具调用 · 顶部聚合数字实时累加 · 右侧事件流跨员工时序混排。</div>

    <div class="facts">
      <div class="fact">
        <div class="fact-num">6 路</div>
        <div class="fact-label">SSE 流并发 · 真 LLM</div>
      </div>
      <div class="fact">
        <div class="fact-num">~50 秒</div>
        <div class="fact-label">全员完成一天的活</div>
      </div>
      <div class="fact">
        <div class="fact-num">¥1.5 / 次</div>
        <div class="fact-label">6 路并发实测成本</div>
      </div>
    </div>

    <div class="figure">
      <img src="${img.orchestraDone}" alt="6 路并行完成">
    </div>
    <div class="caption">50 秒后画面：6 卡片陆续完成 · 全员事件流累计 60+ 工具调用 · 产出 8 件成品。</div>
  </div>
</section>

<section>
  <div class="container">
    <div class="eyebrow">03 · 钻进单员工</div>
    <h2>看 <em>陈昊</em> 怎么真的修一个 bug</h2>
    <p class="section-lead">绿色 <span class="pill pill-live"><span style="width:6px;height:6px;border-radius:50%;background:var(--sage);display:inline-block;"></span> LIVE · CLAUDE-SONNET-4.6</span>
      徽章 = 现在跑的是真的 LLM。Anthropic 8 大机制 token 实时流动给你看 ——
      哪个机制吃多少、什么时候被激活，都不是写死的数字。</p>

    <div class="row">
      <div>
        <div class="figure"><img src="${img.alexRun}" alt="陈昊运行中"></div>
        <div class="caption">运行 8 秒：phase 推进到「调工具」· 8 大机制按真实推理量级亮起。</div>
      </div>
      <div>
        <div class="figure"><img src="${img.alexDone}" alt="陈昊完成"></div>
        <div class="caption">完成：Gitee PR !419 已创建 · 关联 issue #412 · 测试 14/14 绿。</div>
      </div>
    </div>

    <div class="quote">
      "这版可视化最值钱的不是它能跑 —— 是它把 Anthropic 8 机制每一条都钉在了具体代码模块上。
      演示给你看的就是 token 在每个机制里怎么流动的。"
      <cite>— 直播金句备用</cite>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="eyebrow">04 · 不同员工 · 不同剧本</div>
    <h2>沈墨用的机制和陈昊<em>完全不一样</em></h2>
    <p class="section-lead">陈昊（CTO）重 jit-retrieval + few-shot + notes —— 找代码、对照修法、留痕。
      沈墨（数据分析）重 sub-agents + compaction —— 跨表 spawn 子 agent、把 32 个数据源压成 4 张图。</p>

    <div class="figure">
      <img src="${img.lucasLive}" alt="沈墨运行中">
    </div>
    <div class="caption">/employee/lucas · 沈墨在拉昨日抖店 GMV + 小红书种草 + 私域转化漏斗 · 飞书 #daily-bi 推送日报。</div>
  </div>
</section>

<section>
  <div class="container">
    <div class="eyebrow">05 · 飞书指挥</div>
    <h2>所有事都是 <em>飞书一句话</em>触发的</h2>
    <p class="section-lead">前面看到的 6 路并行，生产里就这样开始：飞书里发 @陈昊 / @江雨，或 /hire 招新员工。
      底层走 <code class="mono">gateway/platforms/feishu.py</code> → ACP 协议 → 派给对应员工。</p>

    <div class="figure">
      <img src="${img.feishu}" alt="飞书指挥入口">
    </div>
    <div class="caption">/feishu · 扫码 + 历史指令示例。@陈昊 修 bug · @江雨 跟客户 · /hire 招新员工，每条都对应真实员工剧本。</div>
  </div>
</section>

<section>
  <div class="container">
    <div class="eyebrow">06 · 落地场景</div>
    <h2>5 个可以<em>照抄的</em>一人公司模板</h2>
    <p class="section-lead">每个场景都有真实国内外案例，并标注可追溯来源。一人千万 / 内容流水线 / 私域销售 /
      AI Dev 团队 / 抖店电商 —— 复制配置到你的飞书就能开跑。</p>

    <div class="figure">
      <img src="${img.scenariosTop}" alt="5 个落地场景">
    </div>
    <div class="caption">/scenarios · 5 个真实落地模板 · Heygen 50 人 26 亿美金估值 / 妙鸭 7 天 PV 过亿 / 00 后开发月入 ¥10 万。</div>
  </div>
</section>

<section>
  <div class="container">
    <div class="eyebrow">07 · 工程可信度</div>
    <h2>这不是 demo · 是<em>工业级形态</em></h2>

    <ul class="checks">
      <li><b>真接 OpenRouter</b> · Claude Sonnet 4.6 流式调用 · 每次 demo 实测 ¥0.04（单员工）/ ¥1.5（6 路并行）</li>
      <li><b>三层降级</b> · 没 Key / API 失败 / 超时 → 自动切 Mock 剧本 · 现场不会翻车</li>
      <li><b>事件协议解耦</b> · 前端 0 改动 · LLM 直接吐 NDJSON 流 · 后端转发为 SSE</li>
      <li><b>跨员工本土化</b> · 工具 paletted 全部国内（飞书 / 钉钉 / 抖店 / 阿里云 / 脉脉 / 企微）· 货币 / 时区 / 平台名一致</li>
      <li><b>底层 Hermes</b> · Nous Research 95K+ stars · 把 Anthropic 8 机制全部固化到代码模块</li>
    </ul>
  </div>
</section>

<footer>
  <div class="container">
    <div>
      <h3>FF-CoWorker · Case 06</h3>
      <p>赋范空间 · Agent 智能体开发及上下文工程入门<br>
        基于 Hermes Agent · ACP 多 agent 协议 · Claude Sonnet 4.6</p>
    </div>
    <div>
      <h3>路由</h3>
      <ul>
        <li>/ · 首页</li>
        <li>/office · 办公室</li>
        <li>/employee/[id]</li>
        <li>/scenarios · 5 场景</li>
        <li>/feishu · 指挥入口</li>
      </ul>
    </div>
    <div>
      <h3>本机运行</h3>
      <ul>
        <li>pnpm dev → :3210</li>
        <li>必须用 localhost</li>
        <li>OPENROUTER_API_KEY</li>
        <li>AGENT_MODEL=claude-sonnet-4.6</li>
      </ul>
    </div>
  </div>
  <div class="meta container">Generated · case-06-ff-coworker · ${new Date().toISOString().slice(0, 10)}</div>
</footer>

</body>
</html>`;

  await fs.writeFile(OUT, html);
  const size = (await fs.stat(OUT)).size;
  console.log(`[showcase] ✓ ${OUT}`);
  console.log(`[showcase] size: ${(size / 1024 / 1024).toFixed(2)} MB`);
};

main().catch((err) => {
  console.error("[showcase] FATAL", err);
  process.exit(1);
});
