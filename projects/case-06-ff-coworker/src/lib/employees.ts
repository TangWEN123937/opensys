/**
 * 6 位 AI 员工 · 一人公司的核心编制（国内场景版）
 * 头像使用首字母 + 色块方案，避免第三方图片引入（商业级但不依赖外链）
 */

export type EmployeeStatus = "autonomous" | "thinking" | "awaiting" | "idle";

export interface Employee {
  id: string;
  name: string;
  role: string;
  title: string;
  initials: string;
  bgColor: string;
  accent: string;
  // 空间定位 · 等距办公室里的工位坐标（百分比，相对于 SVG viewBox）
  seat: { x: number; y: number };
  desk: "left" | "right" | "top" | "bottom" | "center";
  toolIcon: string; // emoji 用于桌面道具
  status: EmployeeStatus;
  metrics: {
    todayCount: number;
    todayLabel: string;
    totalLabel: string;
    totalValue: string;
  };
  introLine: string; // 第一人称自我介绍
  skills: string[];  // 对应 Hermes skills/ 的目录名
  cases: string[];   // 这个员工在哪些落地场景里出现
}

export const employees: Employee[] = [
  {
    id: "alex",
    name: "陈昊",
    role: "首席工程师",
    title: "CTO 员工 · 全栈 / 微信生态",
    initials: "陈",
    bgColor: "#2A2724",
    accent: "#C9A961",
    seat: { x: 30, y: 60 },
    desk: "left",
    toolIcon: "💻",
    status: "autonomous",
    metrics: {
      todayCount: 12,
      todayLabel: "今日合并 PR",
      totalLabel: "累计交付功能",
      totalValue: "1,247",
    },
    introLine: "我负责小程序、H5、后端 API 全栈开发。你白天提需求，我夜里部署上线。",
    skills: ["devops", "autonomous-ai-agents/claude-code", "gitee"],
    cases: ["一人千万", "AI Dev 团队"],
  },
  {
    id: "aria",
    name: "林夏",
    role: "创意设计",
    title: "Creative 员工 · 小红书 / 抖音素材",
    initials: "林",
    bgColor: "#D97757",
    accent: "#FBF7F1",
    seat: { x: 30, y: 36 },
    desk: "left",
    toolIcon: "🎨",
    status: "thinking",
    metrics: {
      todayCount: 47,
      todayLabel: "今日出图",
      totalLabel: "累计素材",
      totalValue: "8,912",
    },
    introLine: "我做小红书种草图、抖音封面、公众号头图。一个产品描述，给你一百张素材。",
    skills: ["creative", "media"],
    cases: ["内容流水线", "抖店 / 小红书电商"],
  },
  {
    id: "maya",
    name: "苏雯",
    role: "客户服务",
    title: "Support 员工 · 抖店 / 小红书客服",
    initials: "苏",
    bgColor: "#4C5B8F",
    accent: "#FBF7F1",
    seat: { x: 70, y: 60 },
    desk: "right",
    toolIcon: "🎧",
    status: "autonomous",
    metrics: {
      todayCount: 189,
      todayLabel: "今日处理工单",
      totalLabel: "累计对话",
      totalValue: "24,601",
    },
    introLine: "我 7×24 接抖店、小红书、企微的客服咨询。响应从 12 小时压到 108 秒。",
    skills: ["email", "productivity"],
    cases: ["抖店 / 小红书电商", "私域销售"],
  },
  {
    id: "lucas",
    name: "沈墨",
    role: "数据分析",
    title: "Analyst 员工 · 飞书日报",
    initials: "沈",
    bgColor: "#7A9B7A",
    accent: "#FBF7F1",
    seat: { x: 70, y: 36 },
    desk: "right",
    toolIcon: "📊",
    status: "awaiting",
    metrics: {
      todayCount: 6,
      todayLabel: "今日产出报告",
      totalLabel: "覆盖数据源",
      totalValue: "32",
    },
    introLine: "我每天早 9 点把昨日 GMV、抖音直播、小红书种草数据拉齐 · 飞书 / 钉钉送达。",
    skills: ["data-science", "diagramming"],
    cases: ["一人千万", "内容流水线"],
  },
  {
    id: "ava",
    name: "江雨",
    role: "私域销售",
    title: "SDR 员工 · 私域 / 出海双线",
    initials: "江",
    bgColor: "#B35A3F",
    accent: "#FBF7F1",
    seat: { x: 50, y: 70 },
    desk: "bottom",
    toolIcon: "✉️",
    status: "autonomous",
    metrics: {
      todayCount: 1247,
      todayLabel: "今日发送（私域+邮件）",
      totalLabel: "线索成本 CPL",
      totalValue: "¥38",
    },
    introLine: "我做私域 1V1 跟进 + 出海邮件双线。每条都引用对方业务真实信息，不群发。",
    skills: ["email", "feeds", "wechat-work"],
    cases: ["私域销售", "一人千万"],
  },
  {
    id: "marcus",
    name: "罗川",
    role: "运维安全",
    title: "Ops 员工 · 阿里云 / 腾讯云",
    initials: "罗",
    bgColor: "#0F0F12",
    accent: "#D97757",
    seat: { x: 50, y: 24 },
    desk: "top",
    toolIcon: "🚀",
    status: "autonomous",
    metrics: {
      todayCount: 3,
      todayLabel: "今日拦截告警",
      totalLabel: "系统可用率",
      totalValue: "99.97%",
    },
    introLine: "我守着你的阿里云 / 腾讯云。CPU 尖刺、慢 SQL、ICP 备案、SSL 过期，我先看到。",
    skills: ["devops", "mlops"],
    cases: ["AI Dev 团队", "一人千万"],
  },
];

export const getEmployee = (id: string) => employees.find((e) => e.id === id);

export const statusLabel: Record<EmployeeStatus, string> = {
  autonomous: "自主运行",
  thinking:   "思考中",
  awaiting:   "等待审批",
  idle:       "休眠",
};

export const statusColor: Record<EmployeeStatus, string> = {
  autonomous: "var(--color-sage)",
  thinking:   "var(--color-warmth)",
  awaiting:   "var(--color-gold)",
  idle:       "var(--color-ink-lo)",
};
