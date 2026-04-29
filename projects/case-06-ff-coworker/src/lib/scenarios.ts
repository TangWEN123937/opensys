/**
 * 5 个一人公司真实落地场景（国内场景版）
 * 数据来源：海外标杆 + 国内对标案例
 */

export interface Scenario {
  id: string;
  badge: string;
  title: string;
  headline: string;
  subhead: string;
  heroQuote: string;
  heroSource: string;
  employees: string[];          // 本场景亮起的员工 id
  roi: { label: string; value: string; detail: string }[];
  pipeline: { role: string; action: string }[];
  caseStudies: { name: string; detail: string; source: string }[];
}

export const scenarios: Scenario[] = [
  {
    id: "one-person-unicorn",
    badge: "01",
    title: "一人千万",
    headline: "一个人，把公司做到 ¥3 亿年营收",
    subhead: "海外 Medvi $401M · 国内 Heygen 估值 $26 亿（华人创立）· 一人公司不是噱头",
    heroQuote: "代码用 AI 写 · 素材用 AI 出 · 客服用 AI 接 · 我只做一件事：定战略。",
    heroSource: "Heygen 创始人徐卓 · 2025 公开访谈",
    employees: ["alex", "aria", "maya", "lucas"],
    roi: [
      { label: "启动资金",    value: "¥15 万",     detail: "一次性 · 无融资" },
      { label: "2025 营收",   value: "¥3 亿+",     detail: "上线一年 · DTC + 私域" },
      { label: "团队规模",    value: "1 + 6",      detail: "1 位老板 · 6 个 AI 员工" },
      { label: "资本效率",    value: "10-50×",     detail: "vs 传统创业团队" },
    ],
    pipeline: [
      { role: "CTO 员工",      action: "Claude Code 写小程序 + 后端 API（2 个月）" },
      { role: "Creative 员工", action: "通义万相 / 即梦 出小红书种草图" },
      { role: "Support 员工",  action: "抖店 + 小红书 + 企微 三渠道客服" },
      { role: "Analyst 员工",  action: "每日 GMV / 复购 / 漏斗 飞书日报" },
    ],
    caseStudies: [
      { name: "Heygen",     detail: "华人创立 · 2025 估值 26 亿美元 · 50 人小团队",     source: "Forbes 2025 / 36 氪" },
      { name: "妙鸭相机",   detail: "上线 7 天 PV 过亿 · 阿里小团队孵化",          source: "新浪科技" },
      { name: "Medvi",     detail: "海外标杆 · $401M 营收 · 创始人 + 弟弟 2 人",    source: "therundown.ai" },
    ],
  },
  {
    id: "content-pipeline",
    badge: "02",
    title: "内容流水线",
    headline: "小红书 + 公众号 + 视频号 三平台周更不断",
    subhead: "选题 → 撰写 → 配图 → 发布 · 一个独立创作者把内容产量提 8×",
    heroQuote: "传统 4 小时一篇 · AI 30 分钟一篇 · 每周多收回 20+ 小时做选题。",
    heroSource: "国内独立创作者社群 · 2026 基准",
    employees: ["aria", "lucas"],
    roi: [
      { label: "成本降幅",    value: "60-80%",     detail: "外包 ¥300/篇 → AI ¥10-30/篇" },
      { label: "流量增长",    value: "+40%",       detail: "小红书种草号 138 篇实测" },
      { label: "整体 ROI",    value: "900%",       detail: "¥800 工具 → ¥7,200 增收" },
      { label: "每周省时",    value: "20+ 小时",   detail: "相当于一个兼职运营" },
    ],
    pipeline: [
      { role: "Researcher 员工", action: "新红 / 蝉妈妈 抓热词 · 选题清单" },
      { role: "Writer 员工",     action: "1,500 字小红书 / 公众号草稿 · 含合规审查" },
      { role: "Designer 员工",   action: "配图 · 信息图 · 抖音封面" },
      { role: "Publisher 员工",  action: "新榜 / 微小宝 定时发布 · 多平台同步" },
    ],
    caseStudies: [
      { name: "新红榜种草号",  detail: "13 个月 138 篇 · 流量 +40% · 无限流",       source: "新红榜公开数据" },
      { name: "独立公众号主",  detail: "¥10 万/月知识付费 · 90% AI 初稿 · 8 个月 +300% 自然流量", source: "知识星球" },
    ],
  },
  {
    id: "private-sdr",
    badge: "03",
    title: "私域销售",
    headline: "私域 1V1 + 出海邮件双线 · 一人不加员",
    subhead: "国内私域走企微 · 出海走 SMTP · CPL ¥38 / 线索（行业平均 ¥150+）",
    heroQuote: "她不是群发模板 · 每条都引用对方脉脉最近一条动态。",
    heroSource: "国内 To B 创业者社群 · 实测",
    employees: ["ava", "lucas"],
    roi: [
      { label: "周私域量",     value: "40,000",    detail: "188 个潜客 × 200 工作日" },
      { label: "每周正响应",   value: "8-15 条",   detail: "ICP 漏斗上游" },
      { label: "每线索成本",   value: "¥38",       detail: "远低于行业 ¥150+" },
      { label: "销售省时",     value: "-1 天/周",  detail: "AI 代做背景调研" },
    ],
    pipeline: [
      { role: "Prospector 员工", action: "在脉脉 / 知乎 / 启信宝 挖 ICP 潜客" },
      { role: "Outreach 员工",   action: "引用对方业务 · 个性化企微开场 / 邮件" },
      { role: "Qualifier 员工",  action: "看回复 signal · BANT 打分" },
      { role: "Scheduler 员工",  action: "约会议 · 同步飞书日历 / 国内 CRM" },
    ],
    caseStudies: [
      { name: "国内 SaaS 创业者", detail: "私域 4 万条 · 每周 8-15 正响应 · ¥38 CPL",   source: "公众号案例" },
      { name: "出海邮件 SDR",     detail: "10 万邮件 / 月 · $45 CPL · 销售省 1 天/周",   source: "出海笔记" },
    ],
  },
  {
    id: "ai-dev-team",
    badge: "04",
    title: "AI Dev 团队",
    headline: "00 后独立开发者 · 月入 10 万 ¥ AI 工具",
    subhead: "Claude Code 扛主力 · 12 月 259 PR · 40K 行代码 · 替代 5-6 人小队",
    heroQuote: "一个 Claude Code 加我，相当于一个完整的研发小组。",
    heroSource: "国内独立开发者 · V2EX / 即刻分享",
    employees: ["alex", "marcus"],
    roi: [
      { label: "月营收",      value: "¥10-50 万",   detail: "00 后独立开发者 AI 工具 / 出海 SaaS" },
      { label: "周交付 PR",   value: "20-40",       detail: "stop-hook 挂夜跑" },
      { label: "生产力 +",    value: "+50%",        detail: "solo 开发者自评" },
      { label: "团队成本",    value: "省 ¥150 万/年", detail: "替代 5-6 人小队" },
    ],
    pipeline: [
      { role: "PM 员工",     action: "把需求切成 spec" },
      { role: "Coder 员工",  action: "Claude Code 实现 · Gitee / GitHub 提 PR" },
      { role: "QA 员工",     action: "写测试 + 跑阿里云效 / GitHub Actions" },
      { role: "Ops 员工",    action: "阿里云 / 腾讯云 部署 + 飞书告警" },
    ],
    caseStudies: [
      { name: "00 后独立开发", detail: "AI 工具月入 ¥10 万 · 上学时副业起步 · Claude 放大", source: "即刻 / V2EX" },
      { name: "国内出海开发者", detail: "12 月 259 PR + 40K 行 · Opus 4.5 + stop-hook 夜跑", source: "推特 / 小红书" },
    ],
  },
  {
    id: "douyin-ecommerce",
    badge: "05",
    title: "抖店 / 小红书电商",
    headline: "一个店主 · 抖店 + 小红书 + 视频号 三栖运营",
    subhead: "客服响应 12h → 2min · 种草图 500 张/天 · GMV +30%",
    heroQuote: "我一个人开店 · 六个 AI 在帮我接单、发货、出图、跑直播脚本。",
    heroSource: "抖店服务商社群 · 2025 案例",
    employees: ["maya", "aria", "lucas"],
    roi: [
      { label: "客服响应",    value: "12h → 2min",    detail: "国内服饰品牌实测" },
      { label: "客服占比",    value: "60% AI",        detail: "AI 直接闭环 · 22% 转人工" },
      { label: "种草素材",    value: "500/天",        detail: "小红书 + 抖音 双尺寸" },
      { label: "弃购挽回",    value: "+¥6 万/月",     detail: "AI 触发企微 1V1" },
    ],
    pipeline: [
      { role: "Scout 员工",    action: "蝉妈妈 / 飞瓜 选品 + 趋势分析" },
      { role: "Copy 员工",     action: "产品描述 + 抖店详情页 + 直播脚本" },
      { role: "Ads 员工",      action: "千川 / 巨量引擎 自动投放" },
      { role: "Support 员工",  action: "抖店 + 小红书私信 + 企微全闭环" },
    ],
    caseStudies: [
      { name: "抖店服饰头部", detail: "AI 处理 60% 工单 · CSAT +10-20%",          source: "抖店服务商案例" },
      { name: "小红书品牌号", detail: "AI 回复 50%+ 私信 · 种草转化 +25%",         source: "新红 case" },
      { name: "视频号小店",   detail: "AI 个性化推荐 → 页面停留 +40%",             source: "视频号生态" },
    ],
  },
];

export const getScenario = (id: string) => scenarios.find((s) => s.id === id);
