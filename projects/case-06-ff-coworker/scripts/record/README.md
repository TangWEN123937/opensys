# 演示视频自动录制 · macOS / Playwright

把"演示链路 + 字幕"写成 `.json` 剧本，一键录出带虚拟鼠标 + 字幕的 MP4。

## 一键跑

```bash
# 前提：dev server 已在 http://localhost:3333 跑着
pnpm record:smoke                  # 30s hero 滚动烟雾测试
pnpm record:demo scripts/record/scripts/<your>.json
```

输出落到 `artifacts/recordings/<timestamp>-<scriptname>.{webm,mp4}`。

## 文件骨架

```
scripts/record/
├── runner.mjs                    # Playwright 驱动 + 步骤执行器 + ffmpeg 转码
├── inject/
│   ├── cursor-overlay.css        # 虚拟鼠标 + ripple + 字幕条样式
│   └── cursor-overlay.js         # 鼠标 follow real pointermove · window.__rec API
├── scripts/
│   └── hero-scroll.json          # 30 秒烟雾测试剧本
└── README.md                     # 本文档
```

## 剧本 schema

```jsonc
{
  "name": "剧本名",
  "baseUrl": "http://localhost:3333",
  "viewport": { "width": 1440, "height": 900 },
  "slowMo": 0,                 // 全局减速 ms · 调试用
  "steps": [
    { "action": "navigate", "url": "/", "settleMs": 600 },
    { "action": "wait", "ms": 1500 },
    { "action": "subtitle", "text": "字幕内容", "hold": 3000 },
    { "action": "subtitleClear" },
    { "action": "scrollTo", "y": 0, "duration": 1500 },
    { "action": "scrollBy", "y": 700, "duration": 2200 },
    { "action": "moveTo", "selector": "a[href='/dashboard']", "steps": 35 },
    { "action": "moveTo", "x": 720, "y": 580, "steps": 40 },
    { "action": "click", "selector": "button:has-text('启动自驾')" },
    { "action": "type", "selector": "textarea", "text": "30 天小红书涨粉到 500", "speed": 80 },
    { "action": "waitFor", "selector": "[data-state='ready']", "timeout": 15000 }
  ]
}
```

每个 step 可加 `at: "0:00"` 当做时序注释（仅打印用，不参与逻辑）。
任意 step 可附带 `subtitle: "..."`，在该步骤开始时显示字幕。

## 设计要点

- **虚拟鼠标**：DOM 注入 SVG 光标，跟随 `pointermove` 事件移动。Playwright `page.mouse.move(x, y, { steps: 30 })` 派发的合成事件会驱动它。
- **字幕**：DOM 覆盖层，烧进画面。无需 SRT。
- **系统鼠标隐藏**：CSS `cursor: none` 全局生效，避免双光标。
- **录制后端**：Playwright `recordVideo` (WebM) → ffmpeg 转 MP4 + faststart。
- **跨路由**：`addInitScript` 在每次导航时重跑，cursor + subtitle 自动重建。

## 写剧本必读 · 两份强制规范

| 文档 | 管什么 | 配套自动化 |
|---|---|---|
| [`SUBTITLE-STYLE.md`](./SUBTITLE-STYLE.md) | 字幕**怎么写**（5 禁令 + 8 句式 + 6 checklist） | `pnpm record:lint` · 启动 runner 自动跑 |
| [`PRE-RECORD-AUDIT.md`](./PRE-RECORD-AUDIT.md) | 剧本**承诺 vs 源码现状**对账（防止"嘴炮但不实"） | 手工 5 步检查 + 项目功能现状清单 |

**写完字幕 → 过 SUBTITLE-STYLE 6 项 → 过 PRE-RECORD-AUDIT 5 步 → 才能 record。**

---

## 视频加速

剧本顶层加 `"speedup": 2.0`，runner 会用 `ffmpeg -filter:v setpts=PTS/2` 输出 2 倍速 MP4。原片 3 分钟 → 成片 1:30。

```jsonc
{
  "name": "...",
  "speedup": 2.0,    // 1 = 原速 · 2 = 2 倍速 · 1.5 = 1.5 倍速
  "steps": [...]
}
```

> 💡 字幕 hold 时长按**原片**配，加速后会自动等比缩短。例如 `hold: 4000` 在 2x 下显示 2 秒 —— 刚好够读完一条 ≤20 字的字幕。

---

## 已知限制

- Next.js dev mode 角落的"1 Issue"红点会进画面 —— 生产上请用 `pnpm build && pnpm start` 后录制。
- 真 LLM 调用有 5–15s 延迟，剧本里要给 `waitFor` 留够 timeout。
- 字幕字号 22px，长句建议 ≤ 25 个汉字，避免换行抖动。
