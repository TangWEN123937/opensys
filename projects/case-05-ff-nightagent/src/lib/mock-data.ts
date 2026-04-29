/**
 * 本地演示 mock data —— 没有 ANTHROPIC_API_KEY 时的 fallback 数据源
 */

export type PlanStatus = "done" | "doing" | "pending";

export interface PlanTaskMock {
  id: string;
  text: string;
  status: PlanStatus;
  progress?: string;
}

export interface TimelineEventMock {
  id: string;
  time: string;
  type: "reasoning" | "tool_call" | "tool_result" | "approval" | "post";
  content: string;
  meta?: Record<string, string>;
}

export interface GoalMock {
  id: string;
  title: string;
  description: string;
  status: "running" | "paused" | "done";
  createdAt: string;
  metrics: { label: string; value: string; trend: string; subtle?: boolean }[];
  plan: PlanTaskMock[];
  events: TimelineEventMock[];
}

export interface ApprovalMock {
  id: string;
  goalTitle: string;
  platform: "xiaohongshu" | "douyin" | "shipinhao" | "weixin" | "bilibili";
  preview: string;
  scheduledAt: string;
  createdAt: string;
  draft: {
    image?: string;
    body: string;
  };
}

export interface ScheduleMock {
  id: string;
  emoji: string;
  name: string;
  cron: string;
  humanReadable: string;
  nextRun: string;
  lastRuns: ("success" | "warn" | "error")[];
  enabled: boolean;
}

export interface McpServerMock {
  id: string;
  name: string;
  toolCount: number;
  status: "active" | "paused";
  description: string;
}

/* ════════════════════════════════════════════════════ */
/*                       GOALS                           */
/* ════════════════════════════════════════════════════ */

export const MOCK_GOALS: GoalMock[] = [
  {
    id: "growth-plan-q2",
    title: "4 月底前把小红书涨粉到 1K",
    description:
      "聚焦 AI 工具点评话题 · 每周 3 条图文 + 1 条短视频 · 1 小时内回复评论与私信。",
    status: "running",
    createdAt: "2026-04-15",
    metrics: [
      { label: "关注者", value: "+547", trend: "+12.5%" },
      { label: "互动率", value: "8.3%", trend: "+0.6pt" },
      { label: "选题储备", value: "24", trend: "本周", subtle: true },
      { label: "自动周报", value: "4", trend: "已生成", subtle: true },
    ],
    plan: [
      { id: "p1", text: "扫描 5 个竞品账号", status: "done" },
      { id: "p2", text: "提取过去 14 天热门话题", status: "done" },
      { id: "p3", text: "起草 10 条内容变体", status: "done" },
      {
        id: "p4",
        text: "生成 3 张主视觉",
        status: "doing",
        progress: "2/3",
      },
      { id: "p5", text: "排入发布日程", status: "pending" },
      { id: "p6", text: "准备 DM 回复模板", status: "pending" },
      { id: "p7", text: "撰写本周复盘", status: "pending" },
    ],
    events: [
      {
        id: "e1",
        time: "20:13",
        type: "reasoning",
        content:
          "本周竞品密集发布 『2026 Q1 AI 工具』 相关短图文，受众对『人的故事』反响比技术规格高 3 倍。",
      },
      {
        id: "e2",
        time: "20:14",
        type: "tool_call",
        content: "browser.screenshot",
        meta: { target: "xhs.com/@alice" },
      },
      {
        id: "e3",
        time: "20:15",
        type: "tool_call",
        content: "image.generate",
        meta: { target: "hero-variant-2.png" },
      },
      {
        id: "e4",
        time: "20:16",
        type: "reasoning",
        content: "正在起草第 3 条变体，语调更冷静一些……",
      },
      {
        id: "e5",
        time: "20:16",
        type: "tool_call",
        content: "image.generate",
        meta: { target: "hero-variant-3.png" },
      },
    ],
  },
  {
    id: "dm-monitor",
    title: "1 小时内回复入站评论与私信",
    description: "用品牌语气回复 · 商单线索上报等待审批。",
    status: "running",
    createdAt: "2026-04-19",
    metrics: [
      { label: "已回复", value: "32", trend: "近 7 天" },
      { label: "已上报", value: "4", trend: "待处理", subtle: true },
      { label: "平均延迟", value: "1h 12m", trend: "-34%" },
      { label: "情绪", value: "87%", trend: "正向" },
    ],
    plan: [],
    events: [],
  },
];

/* ════════════════════════════════════════════════════ */
/*                     APPROVALS                         */
/* ════════════════════════════════════════════════════ */

export const MOCK_APPROVALS: ApprovalMock[] = [
  {
    id: "a1",
    goalTitle: "4 月底前把小红书涨粉到 1K",
    platform: "xiaohongshu",
    preview:
      "打工人速码 ⏰ 5 款 AI 工具实测，第 3 款让我加班少 2 小时…",
    scheduledAt: "明天 09:00",
    createdAt: "刚刚",
    draft: {
      body: "打工人速码 ⏰ 5 款 AI 工具实测，第 3 款让我加班少 2 小时\n\n最近被同事疯狂安利 AI 工具，一口气试了 8 款，留下这 5 款真香的👇\n\n① 飞书妙记｜开会自动转字幕 + 提纲，再也不用边听边记\n② Claude 4.7｜写周报 / 复盘，3 分钟出 800 字初稿\n③ ChatGPT｜翻译英文合同条款，比有道顺 100 倍 ✅\n④ 即梦 AI｜30 秒出节日海报，老板说「做张图」不再头大\n⑤ Cursor｜自动跑数据脚本，再也不用熬夜对账\n\n哪款是你的本命？评论区蹲一波～👇\n#AI工具 #打工人神器 #效率提升 #办公必备",
    },
  },
  {
    id: "a2",
    goalTitle: "1 小时内回复入站评论与私信",
    platform: "xiaohongshu",
    preview:
      "宝子你好~ 第 3 款是 Claude，网页版免费试用，链接私信发你啦…",
    scheduledAt: "立即",
    createdAt: "8 分钟前",
    draft: {
      body: "宝子你好~ 这条评论我看到啦 ❤️\n\n第 3 款是 Claude（4.7 版本），网页版直接搜 claude.ai 就能用，新号免费有 10 次对话额度。\n\n国内访问不稳定的话，可以走 OpenRouter 中转，我整理了一份《保姆级注册教程》在主页第 2 篇笔记 📌\n\n有问题再 dd 我哈，晚上 9 点后回复会更快一些～",
    },
  },
];

/* ════════════════════════════════════════════════════ */
/*                     SCHEDULES                         */
/* ════════════════════════════════════════════════════ */

export const MOCK_SCHEDULES: ScheduleMock[] = [
  {
    id: "s1",
    emoji: "🌅",
    name: "每日竞品扫描",
    cron: "0 8 * * *",
    humanReadable: "每天 08:00 运行",
    nextRun: "2026-04-24 08:00",
    lastRuns: ["success", "success", "warn"],
    enabled: true,
  },
  {
    id: "s2",
    emoji: "📅",
    name: "每周增长复盘",
    cron: "0 20 * * 0",
    humanReadable: "每周日 20:00 运行",
    nextRun: "2026-04-27 20:00",
    lastRuns: ["success", "success", "success"],
    enabled: true,
  },
  {
    id: "s3",
    emoji: "🔔",
    name: "DM 监听轮询",
    cron: "*/5 * * * *",
    humanReadable: "每 5 分钟轮询一次",
    nextRun: "2026-04-23 00:50",
    lastRuns: ["success", "warn", "success"],
    enabled: true,
  },
  {
    id: "s4",
    emoji: "🌙",
    name: "深夜内容起草",
    cron: "0 2 * * 1-5",
    humanReadable: "工作日 02:00 运行",
    nextRun: "2026-04-23 02:00",
    lastRuns: ["success", "success", "error"],
    enabled: false,
  },
];

/* ════════════════════════════════════════════════════ */
/*                     MCP SERVERS                       */
/* ════════════════════════════════════════════════════ */

export const MOCK_MCP: McpServerMock[] = [
  {
    id: "m1",
    name: "xiaohongshu-api",
    toolCount: 6,
    status: "active",
    description: "小红书 · 发图文/视频 · 评论与私信 · 数据分析",
  },
  {
    id: "m2",
    name: "douyin-api",
    toolCount: 5,
    status: "active",
    description: "抖音 · 发短视频 · 读 feed · 回评论",
  },
  {
    id: "m3",
    name: "skyvern-browser",
    toolCount: 8,
    status: "active",
    description: "视觉驱动的浏览器自动化（没 API 也能做）",
  },
  {
    id: "m4",
    name: "claudecron",
    toolCount: 7,
    status: "active",
    description: "定时 / 间隔 / 文件监听 / session hook",
  },
  {
    id: "m5",
    name: "shipinhao",
    toolCount: 4,
    status: "paused",
    description: "微信视频号 · 通过浏览器 session 手动登录",
  },
];
