/**
 * 6 位 AI 员工的"可演示"脚本 · mock streaming（国内场景版）
 *
 * 每个 employee 对应一段 ScriptStep[]，按 delay 顺序 emit 事件。
 * 客户端订阅 /api/agent/[id]，按事件类型驱动 UI。
 *
 * 这是 mock 兜底剧本 —— 当 OpenRouter Key 缺失/调用失败时使用。
 * 事件形态 / 节奏与真实 streaming 1:1，工具名 / 平台 / 货币全部国内化。
 */

export type AgentEvent =
  | { t: "boot";       title: string; subtitle: string }
  | { t: "phase";      phase: "thinking" | "retrieving" | "tool" | "writing" | "shipping" | "done"; label: string }
  | { t: "mechanism";  id: string; tokens: number; note?: string }
  | { t: "tool";       id: string; name: string; args: Record<string, string | number>; result: string; ms: number }
  | { t: "token";      text: string }
  | { t: "log";        level: "info" | "ok" | "warn"; text: string }
  | { t: "metric";     key: "todayCount" | "cost" | "tokens"; delta: number }
  | { t: "artifact";   kind: "pr" | "image" | "email" | "report" | "alert" | "ticket"; title: string; meta?: string }
  | { t: "done";       summary: string; durationMs: number };

export type ScriptStep = { delay: number; event: AgentEvent };

// ───────────── helpers ─────────────

/** 把一段文字切成 typewriter chunks（5-8 字一刀 · 确定性 · 避免 SSR/CSR mismatch） */
const stream = (text: string, baseDelay = 36): ScriptStep[] => {
  const chunks: string[] = [];
  let i = 0;
  let n = 0;
  while (i < text.length) {
    const size = Math.min(text.length - i, 5 + (n % 4));
    chunks.push(text.slice(i, i + size));
    i += size;
    n += 1;
  }
  return chunks.map((c, idx) => ({
    delay: baseDelay + ((idx * 7) % 24),
    event: { t: "token", text: c } as AgentEvent,
  }));
};

const wait = (ms: number, ev: AgentEvent): ScriptStep => ({ delay: ms, event: ev });

// ───────────── 6 位员工的脚本 ─────────────

const alex: ScriptStep[] = [
  wait(0,    { t: "boot",      title: "陈昊接到任务", subtitle: "用户报告：微信小程序登录后白屏 · prod 偶发" }),
  wait(180,  { t: "phase",     phase: "thinking", label: "读飞书工单 · 拉云日志 · 定位嫌疑文件" }),
  wait(160,  { t: "mechanism", id: "system-prompt", tokens: 412, note: "加载 CTO 工牌 · 团队编码规范" }),
  wait(140,  { t: "mechanism", id: "tools",         tokens: 318, note: "挂载 gitee / shell / 微信云函数日志" }),
  wait(180,  { t: "phase",     phase: "retrieving", label: "搜历史 issue · 排查类似 case" }),
  wait(220,  { t: "tool", id: "t1", name: "gitee.search_issues", args: { repo: "company/wxapp", q: "登录 白屏" }, result: "找到 #1842 · 14 评论 · 关联 PR #1851 已 revert", ms: 412 }),
  wait(140,  { t: "mechanism", id: "jit-retrieval", tokens: 624, note: "按需检索 · 仅打开 2 个候选文件" }),
  wait(180,  { t: "tool", id: "t2", name: "shell.grep",  args: { pattern: "wx.login.*callback", path: "src/" }, result: "命中 src/auth/wx-session.ts:147", ms: 88 }),
  wait(120,  { t: "tool", id: "t3", name: "shell.read",  args: { path: "src/auth/wx-session.ts", lines: "120-180" }, result: "session 缺 null check · openid 过期未刷新", ms: 31 }),
  wait(160,  { t: "tool", id: "t4", name: "wxapp.cloudlog", args: { fn: "auth-callback", since: "2h" }, result: "近 2h 报错 38 次 · 集中在 iOS 18.2 微信 8.0.45", ms: 220 }),
  wait(160,  { t: "phase",     phase: "tool", label: "起草 patch · 跑测试" }),
  wait(120,  { t: "mechanism", id: "few-shot", tokens: 802, note: "对照过去 3 个 wx-login 标准修法" }),
  wait(180,  { t: "tool", id: "t5", name: "shell.apply_patch", args: { file: "src/auth/wx-session.ts" }, result: "+12 / -4 · 通过 lint", ms: 156 }),
  wait(220,  { t: "tool", id: "t6", name: "shell.test",        args: { suite: "auth" }, result: "✓ 38 passed · 0 failed · 1.4s", ms: 1420 }),
  wait(160,  { t: "phase",     phase: "writing", label: "撰写 PR 描述" }),
  ...stream("根因：openid 过期后未走刷新分支，iOS 微信 8.0.45 触发更频繁。修法：增加 null check + 主动调 wx.login 重发..."),
  wait(180,  { t: "mechanism", id: "notes", tokens: 920, note: "写入 incident-log · 跨 session 留痕" }),
  wait(160,  { t: "phase",     phase: "shipping", label: "提 PR · 通知 reviewer" }),
  wait(220,  { t: "tool", id: "t7", name: "gitee.create_pr", args: { branch: "fix/wx-login-white", base: "main" }, result: "PR !1873 created · 等待 CI", ms: 612 }),
  wait(140,  { t: "metric",    key: "todayCount", delta: 1 }),
  wait(120,  { t: "metric",    key: "cost",       delta: 0.31 }),
  wait(180,  { t: "artifact",  kind: "pr", title: "PR !1873 · fix(auth): wx-session openid 过期未刷新", meta: "+12 / -4 · 1 file · CI: pending" }),
  wait(120,  { t: "log", level: "ok", text: "Reviewer @罗川 已在飞书收到 review 请求" }),
  wait(160,  { t: "done",     summary: "Bug 已修 · PR 已提 · 等待 CI 绿灯后 auto-merge", durationMs: 0 }),
];

const aria: ScriptStep[] = [
  wait(0,   { t: "boot",      title: "林夏接到任务", subtitle: "市场部需求：春季新品 · 出 8 张小红书种草主图 + 抖音封面" }),
  wait(180, { t: "phase",     phase: "thinking", label: "读品牌指南 · 锁定调性" }),
  wait(160, { t: "mechanism", id: "system-prompt", tokens: 380, note: "Creative 工牌 · 品牌色板 · 字体禁用清单" }),
  wait(140, { t: "tool", id: "t1", name: "brand.fetch_guide", args: { brand: "verdance-spring" }, result: "调取最新 v3.2 · 莫兰迪绿 + 暖橙 主导 · 禁用 Comic Sans / 黑体粗", ms: 220 }),
  wait(140, { t: "mechanism", id: "few-shot", tokens: 510, note: "对照去年春季 12 张获奖小红书首图" }),
  wait(220, { t: "log", level: "info", text: "调用调色板 · 准备生成草图" }),
  wait(180, { t: "phase",     phase: "tool", label: "调度图像生成" }),
  wait(160, { t: "mechanism", id: "sub-agents", tokens: 720, note: "spawn 4 个并行渲染 sub-agent" }),
  wait(180, { t: "tool", id: "t2", name: "image.gen",  args: { prompt: "晨光 · 亚麻质感 · 莫兰迪绿色调 · 产品在原木台面", n: 4 }, result: "v01.png · v02.png · v03.png · v04.png", ms: 4200 }),
  wait(220, { t: "log", level: "info", text: "sub-agent#2 偏离 brief（出现金属感）· 自动废弃重渲" }),
  wait(180, { t: "tool", id: "t3", name: "image.gen",  args: { prompt: "再次 · 强调 亚麻哑光 · 无金属反光", n: 1 }, result: "v02b.png · 通过", ms: 1860 }),
  wait(140, { t: "mechanism", id: "compaction", tokens: 880, note: "压缩中间 24 张草稿 · 仅留 8 final" }),
  wait(180, { t: "phase",     phase: "writing", label: "排版 · 加文案 · 双尺寸适配" }),
  ...stream("# 春季新品种草文案（小红书）\n\n这个春天，把柔光带回家 🌿 · 亚麻 + 原木 · 简单到极致..."),
  wait(180, { t: "tool", id: "t4", name: "design.compose",     args: { template: "rednote-3:4", count: 8 }, result: "8 张 3:4 小红书首图已合成", ms: 1240 }),
  wait(180, { t: "tool", id: "t5", name: "design.adapt_size",  args: { from: "3:4", to: "9:16", count: 8 }, result: "8 张 9:16 抖音封面适配完成", ms: 980 }),
  wait(160, { t: "phase",     phase: "shipping", label: "上传 OSS · 通知市场部" }),
  wait(180, { t: "tool", id: "t6", name: "asset.upload_oss", args: { folder: "/spring-2026/hero" }, result: "16 张 · 共 22.4 MB · CDN 已分发（jsdelivr 镜像同步中）", ms: 980 }),
  wait(140, { t: "metric", key: "todayCount", delta: 16 }),
  wait(120, { t: "metric", key: "cost",       delta: 1.84 }),
  wait(160, { t: "artifact", kind: "image", title: "春季主视觉 · 8 小红书 + 8 抖音封面", meta: "双尺寸 · 中文文案 · 已分发 CDN" }),
  wait(160, { t: "done",     summary: "16 张素材交付 · 已 @市场部 验收 · 飞书群收到", durationMs: 0 }),
];

const maya: ScriptStep[] = [
  wait(0,   { t: "boot",      title: "苏雯巡检多渠道工单", subtitle: "抖店 + 小红书 + 企微 共 14 张未处理 · SLA 倒计时 4 张" }),
  wait(180, { t: "phase",     phase: "thinking", label: "按 SLA 紧急度跨渠道排序" }),
  wait(160, { t: "mechanism", id: "system-prompt", tokens: 360, note: "Support 工牌 · 同理心语调 · 退款权限阈值 ¥300" }),
  wait(140, { t: "tool", id: "t1", name: "ticket.list_multichannel", args: { channels: "douyin,rednote,wework", sort: "sla_asc" }, result: "14 工单 · 抖店 6 / 小红书 5 / 企微 3 · 4 张红色", ms: 142 }),
  wait(180, { t: "phase",     phase: "retrieving", label: "拉客户上下文 · 查 KB" }),
  wait(160, { t: "mechanism", id: "jit-retrieval", tokens: 540, note: "只读相关订单与 SOP · 不全量加载" }),
  wait(160, { t: "tool", id: "t2", name: "crm.lookup",   args: { user: "u_8821" }, result: "Plus 用户 · LTV ¥8,940 · 上次客诉 90 天前", ms: 88 }),
  wait(160, { t: "tool", id: "t3", name: "kb.search",    args: { q: "微信支付 · 风控拦截" }, result: "命中 SOP-0042 · 推荐：核对实名信息后手工放行", ms: 156 }),
  wait(160, { t: "tool", id: "t4", name: "wxpay.events", args: { user: "u_8821", limit: 5 }, result: "近 3 次 decline · code: VELOCITY_LIMIT_EXCEEDED", ms: 220 }),
  wait(140, { t: "mechanism", id: "few-shot", tokens: 720, note: "参考过去 5 个同类回复模板" }),
  wait(160, { t: "phase",     phase: "writing", label: "起草回复 · 加同理心" }),
  ...stream("亲，看到您的反馈非常抱歉～ 微信支付近期对您账户做了风控限制，我已为您手工放行..."),
  wait(180, { t: "tool", id: "t5", name: "ticket.reply", args: { count: 14, channel: "multi" }, result: "14 条已回复 · 5 条触发自动退款 · 3 条转人工", ms: 320 }),
  wait(180, { t: "tool", id: "t6", name: "refund.create", args: { count: 5, total_cny: 942 }, result: "5 笔退款已发起 · 总额 ¥942 · 微信退款 / 支付宝原路退回", ms: 380 }),
  wait(160, { t: "phase",     phase: "shipping", label: "汇报今日成果" }),
  wait(140, { t: "metric", key: "todayCount", delta: 14 }),
  wait(120, { t: "metric", key: "cost",       delta: 0.42 }),
  wait(160, { t: "artifact", kind: "ticket", title: "今日批处理 · 14 工单 · 平均响应 47s", meta: "抖店 6 / 小红书 5 / 企微 3 · CSAT 预估 4.6/5" }),
  wait(160, { t: "done",     summary: "14 工单清零 · 5 笔退款 · 3 张转人工", durationMs: 0 }),
];

const lucas: ScriptStep[] = [
  wait(0,   { t: "boot",      title: "沈墨启动晨间日报", subtitle: "每日 09:00 自动触发 · 推送到飞书 #daily-bi" }),
  wait(180, { t: "phase",     phase: "thinking", label: "拉昨日 32 个数据源（抖店 / 小红书 / 私域）" }),
  wait(160, { t: "mechanism", id: "system-prompt", tokens: 320, note: "Analyst 工牌 · 数字精度规范 · 中文表达" }),
  wait(160, { t: "tool", id: "t1", name: "warehouse.query", args: { sql: "yesterday_gmv" }, result: "¥48.2 万 · 环比 +12.4%", ms: 420 }),
  wait(140, { t: "tool", id: "t2", name: "douyin.shop_metrics", args: { range: "yesterday" }, result: "抖店 GMV ¥31.4 万 · 直播 ¥18.2 万 · 短视频 ¥13.2 万", ms: 380 }),
  wait(140, { t: "tool", id: "t3", name: "warehouse.query", args: { sql: "funnel_dropoff" }, result: "结账漏斗第 3 步流失 +6.8% · 异常", ms: 320 }),
  wait(140, { t: "mechanism", id: "jit-retrieval", tokens: 480, note: "对昨日异常项 · 拉对照组数据" }),
  wait(160, { t: "tool", id: "t4", name: "warehouse.query", args: { sql: "step3_dropoff_by_segment" }, result: "iOS 用户 +14% · 安卓持平", ms: 320 }),
  ...stream("发现异常 · 昨日 iOS 在「地址确认」页流失激增 · 联想到罗川昨晚 18:42 那条阿里云告警..."),
  wait(180, { t: "phase",     phase: "tool", label: "交叉验证" }),
  wait(160, { t: "mechanism", id: "sub-agents", tokens: 640, note: "spawn 子 agent · 跨表关联 SLS 日志" }),
  wait(180, { t: "tool", id: "t5", name: "logs.search_sls",  args: { project: "checkout-ios", q: "address_validate" }, result: "iOS 微信 8.0.45 在 18:00 后 timeout 率 +320%", ms: 540 }),
  wait(140, { t: "log", level: "warn", text: "根因锁定：第三方地址校验 API 在 iOS 端超时 · 已 @罗川" }),
  wait(140, { t: "mechanism", id: "compaction", tokens: 760, note: "压缩 32 个数据源 · 仅留 4 张关键图" }),
  wait(160, { t: "phase",     phase: "writing", label: "撰写日报" }),
  ...stream("# 2026-04-26 营收日报\n\n昨日 GMV ¥48.2 万（+12.4% 环比）· 复购率 31.2%（持平）· 一个亮点 + 一个红灯..."),
  wait(180, { t: "tool", id: "t6", name: "chart.render", args: { kind: "funnel", data: "yesterday" }, result: "4 张图已渲染 · PNG + 飞书原生卡片", ms: 480 }),
  wait(160, { t: "phase",     phase: "shipping", label: "推送日报到飞书" }),
  wait(180, { t: "tool", id: "t7", name: "feishu.post", args: { channel: "#daily-bi", at: "@老板" }, result: "已送达 · 阅读 3/3 · 老板已回 👀", ms: 220 }),
  wait(140, { t: "metric", key: "todayCount", delta: 1 }),
  wait(120, { t: "metric", key: "cost",       delta: 0.18 }),
  wait(160, { t: "artifact", kind: "report", title: "2026-04-26 营收日报", meta: "¥48.2 万 · iOS 异常已定位 · 4 图 1 表" }),
  wait(160, { t: "done",     summary: "日报已推 · 异常已升级到罗川", durationMs: 0 }),
];

const ava: ScriptStep[] = [
  wait(0,   { t: "boot",      title: "江雨启动私域 + 出海双线", subtitle: "本周目标：私域 1V1 跟进 188 个潜客 + 北美邮件 60 封" }),
  wait(180, { t: "phase",     phase: "thinking", label: "选 lead · 按 ICP 评分排序" }),
  wait(160, { t: "mechanism", id: "system-prompt", tokens: 410, note: "SDR 工牌 · 私域口语化 · 不许撒谎" }),
  wait(140, { t: "tool", id: "t1", name: "lead.score", args: { batch: 200 }, result: "188 通过 · 12 灰名单（90 天内已联系）", ms: 380 }),
  wait(140, { t: "mechanism", id: "jit-retrieval", tokens: 560, note: "对每个 lead 实时检索脉脉 / 知乎近期动态" }),
  ...stream("处理 lead#1: 王总 · 启明科技 CEO，脉脉刚发『正在招 RAG 工程师』..."),
  wait(180, { t: "tool", id: "t2", name: "maimai.recent",  args: { user: "qiming-ceo" }, result: "3 天前发文 · 提到 RAG 团队扩张", ms: 320 }),
  wait(160, { t: "tool", id: "t3", name: "zhihu.recent",   args: { user: "qiming-ceo" }, result: "上周回答了一个 Agent 工程化的问题 · 1.2K 赞", ms: 280 }),
  wait(140, { t: "mechanism", id: "few-shot", tokens: 720, note: "对照过去 5 条高回复率私域开场" }),
  wait(160, { t: "phase",     phase: "writing", label: "起草个性化私域开场" }),
  ...stream("王总好，看到您 3 天前在脉脉聊 RAG 团队的事。我们最近正好踩了 N 个坑，分享一份失败案例总结给您..."),
  wait(180, { t: "tool", id: "t4", name: "wework.message_compose", args: { tone: "casual", lead: "qiming-ceo" }, result: "3 段企微开场 · 含真实业务情报 · 不群发", ms: 88 }),
  wait(140, { t: "mechanism", id: "compaction", tokens: 820, note: "188 个 lead 的检索结果 · 压缩为 token 摘要" }),
  wait(180, { t: "phase",     phase: "tool", label: "批量个性化生成 · 188 条私域 + 60 邮件" }),
  wait(160, { t: "mechanism", id: "sub-agents", tokens: 1040, note: "spawn 8 个 sub-agent · 每人 ~30 条" }),
  wait(220, { t: "tool", id: "t5", name: "wework.send", args: { count: 188, channel: "wework" }, result: "188 条企微 1V1 已就绪 · 全部含真实业务情报", ms: 6800 }),
  wait(180, { t: "tool", id: "t6", name: "email.batch_compose", args: { count: 60, market: "north-america" }, result: "60 封北美邮件已就绪 · LinkedIn / 推特情报已附", ms: 4200 }),
  wait(180, { t: "phase",     phase: "shipping", label: "分批投递" }),
  wait(180, { t: "tool", id: "t7", name: "email.send_throttled", args: { count: 60, throttle: "20/2min" }, result: "首批 20 封已发 · 后续按节流计划", ms: 1240 }),
  wait(140, { t: "metric", key: "todayCount", delta: 248 }),
  wait(120, { t: "metric", key: "cost",       delta: 1.24 }),
  wait(160, { t: "artifact", kind: "email", title: "今日双线 · 188 私域 + 60 北美邮件", meta: "100% 个性化 · 平均私域回复率预估 12% · 节流分批" }),
  wait(160, { t: "done",     summary: "248 条已发 · 12 灰名单转给苏雯走唤回流程", durationMs: 0 }),
];

const marcus: ScriptStep[] = [
  wait(0,   { t: "boot",      title: "罗川晨间巡检", subtitle: "扫描阿里云 12 个生产服务 · 14 个监控规则" }),
  wait(180, { t: "phase",     phase: "thinking", label: "对照昨晚告警 · 排优先级" }),
  wait(160, { t: "mechanism", id: "system-prompt", tokens: 380, note: "Ops 工牌 · SLO 99.9 · 不许下线 prod" }),
  wait(160, { t: "tool", id: "t1", name: "aliyun.ecs_status", args: { region: "cn-hangzhou" }, result: "84 实例 · 全部 Running · 2 个 RestartCount > 5", ms: 240 }),
  wait(140, { t: "tool", id: "t2", name: "aliyun.cms_alerts", args: { since: "12h" }, result: "3 条 P2 · 0 条 P1 · 内存毛刺 1 次", ms: 120 }),
  wait(140, { t: "mechanism", id: "jit-retrieval", tokens: 520, note: "只对异常实例拉日志 · 非全量" }),
  ...stream("锁定 checkout-ios pod · RestartCount=7 · 联想到沈墨刚发的 iOS 异常..."),
  wait(180, { t: "tool", id: "t3", name: "aliyun.sls_tail",     args: { project: "checkout-ios", lines: 200 }, result: "address-validate 第三方 API 5xx · 已重试 3 次", ms: 320 }),
  wait(160, { t: "tool", id: "t4", name: "vendor.status", args: { service: "高德地图地理编码" }, result: "高德开放平台状态页：已知问题 · 18:00 起 · 修复中", ms: 180 }),
  wait(140, { t: "log", level: "warn", text: "确认是高德 API 故障 · 不是我们的 bug · 但客户体验受影响" }),
  wait(140, { t: "mechanism", id: "few-shot", tokens: 680, note: "对照过去 3 次第三方 API 故障 playbook" }),
  wait(160, { t: "phase",     phase: "tool", label: "执行 fallback playbook" }),
  ...stream("启用本地缓存校验 · 加 30 分钟 grace · 给林夏自动生成「系统繁忙」友好提示页..."),
  wait(180, { t: "tool", id: "t5", name: "feature.flag", args: { name: "addr_validate_fallback", on: 1 }, result: "已开启 · 流量切到本地缓存", ms: 88 }),
  wait(160, { t: "tool", id: "t6", name: "aliyun.ssl_check",     args: { domains: 14 }, result: "14 个域名 · 最近过期 27 天 · 自动续签开启", ms: 420 }),
  wait(160, { t: "tool", id: "t7", name: "icp.beian_check",      args: { domains: 14 }, result: "14 个域名 ICP 备案有效 · 最近到期 192 天后", ms: 280 }),
  wait(140, { t: "mechanism", id: "notes", tokens: 880, note: "写入 incident-2026-04-26 · 5 步处置记录" }),
  wait(160, { t: "phase",     phase: "writing", label: "出晨报" }),
  ...stream("# 2026-04-26 09:12 晨间巡检\n\n3 P2 已处置 · 1 高德故障已 fallback · SLO 仍 99.97%..."),
  wait(180, { t: "tool", id: "t8", name: "feishu.post", args: { channel: "#ops", at: "@老板 @沈墨" }, result: "已送达", ms: 220 }),
  wait(140, { t: "metric", key: "todayCount", delta: 3 }),
  wait(120, { t: "metric", key: "cost",       delta: 0.22 }),
  wait(160, { t: "artifact", kind: "alert", title: "晨报 · 1 高德 API 故障已 fallback", meta: "SLO 99.97% · 客户无感 · 14 SSL/ICP 全绿" }),
  wait(160, { t: "done",     summary: "巡检 OK · 高德故障已被动接管 · 给沈墨发了根因", durationMs: 0 }),
];

export const agentScripts: Record<string, ScriptStep[]> = {
  alex,
  aria,
  maya,
  lucas,
  ava,
  marcus,
};

export const getScript = (id: string): ScriptStep[] | undefined => agentScripts[id];

/** 估算脚本总时长（用于前端显示 ETA） */
export const scriptDurationMs = (id: string): number => {
  const s = agentScripts[id];
  if (!s) return 0;
  return s.reduce((acc, step) => acc + step.delay, 0);
};
