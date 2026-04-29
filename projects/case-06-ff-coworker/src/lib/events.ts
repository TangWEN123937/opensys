/**
 * 事件流 · Dashboard 实时滚动（国内场景版）
 * 非真实数据，但按真实国内一人公司案例（私域销售、抖店客服、阿里云运维）设计
 */

export interface AgentEvent {
  time: string;
  employeeId: string;
  verb: string;
  payload: string;
  mechanism?: string;
  tone?: "success" | "pending" | "alert" | "info";
}

export const eventsFeed: AgentEvent[] = [
  { time: "08:14", employeeId: "alex",   verb: "接到飞书指令",      payload: "修复微信小程序登录回调 bug",          tone: "info" },
  { time: "08:14", employeeId: "alex",   verb: "grep 定位代码",     payload: "src/auth/wx-session.ts:147",          mechanism: "jit-retrieval", tone: "pending" },
  { time: "08:17", employeeId: "alex",   verb: "撰写单测 + PR",     payload: "Gitee PR !234 · 47 行新增",            tone: "pending" },
  { time: "08:19", employeeId: "alex",   verb: "spawn QA 子 agent", payload: "让它跑完整回归",                       mechanism: "sub-agents", tone: "info" },
  { time: "08:22", employeeId: "marcus", verb: "QA 简报返回",       payload: "12/12 通过 · 252 tokens",              mechanism: "sub-agents", tone: "success" },
  { time: "08:23", employeeId: "alex",   verb: "合并并部署",        payload: "v1.2.3 已上 prod（阿里云 ECS）",       tone: "success" },
  { time: "08:24", employeeId: "marcus", verb: "监测 CPU 尖刺",     payload: "阿里云 cn-hangzhou · 已扩 2 实例",     tone: "alert" },
  { time: "08:31", employeeId: "ava",    verb: "调用销售研究工具",  payload: "脉脉 · 知乎 · 启信宝",                 mechanism: "tools", tone: "pending" },
  { time: "08:33", employeeId: "ava",    verb: "发出第 1,247 条",   payload: "引用对方 CEO 上周脉脉发文 · 个性化度 94%", tone: "success" },
  { time: "08:41", employeeId: "aria",   verb: "生成 500 张种草图", payload: "小红书批量 · DTC 钱包品类",            tone: "success" },
  { time: "08:44", employeeId: "aria",   verb: "写笔记到 memory",   payload: "记录：这批莫兰迪绿点击率 +23%",        mechanism: "notes", tone: "info" },
  { time: "08:52", employeeId: "maya",   verb: "客服工单批处理",    payload: "60 条咨询 · AI 解决 38 · 升级 22",     mechanism: "system-prompt", tone: "success" },
  { time: "09:01", employeeId: "lucas",  verb: "日报待审批",        payload: "GMV +18% · 复购 32% · 飞书通知老板",    tone: "pending" },
  { time: "09:03", employeeId: "ava",    verb: "context 压缩触发",   payload: "消息流从 148K → 18K · 保留关键决策",  mechanism: "compaction", tone: "info" },
  { time: "09:07", employeeId: "alex",   verb: "读取 CLAUDE.md",    payload: "加载项目规则到 context 顶部",          mechanism: "system-prompt", tone: "info" },
  { time: "09:11", employeeId: "ava",    verb: "调用 few-shot 范例", payload: "从 5 条最佳私域开场里挑最近似的",      mechanism: "few-shot", tone: "info" },
  { time: "09:15", employeeId: "aria",   verb: "spawn 修图子 agent", payload: "给 127 张图批量加水印",                mechanism: "sub-agents", tone: "pending" },
  { time: "09:18", employeeId: "marcus", verb: "SSL 证书续期",      payload: "shop.example.cn · 到期前 14 天",       tone: "success" },
];

/** 今日 KPI（国内规模 · 人民币） */
export const kpi = {
  revenueToday:      89240,    // 今日 GMV ¥
  ticketsResolved:   347,      // 今日处理工单
  emailsSent:        1247,     // 今日发出私域+邮件
  prsLanded:         12,       // 合并 PR
  responseSec:       108,      // 客服响应秒数
  costToday:         128,      // 今日 AI 成本 ¥
  humanEmployees:    1,
  aiEmployees:       6,
  uptimeHours:       327,
  sleepDelta:        8650,     // 老板昨晚睡觉期间营收增量 ¥
};
