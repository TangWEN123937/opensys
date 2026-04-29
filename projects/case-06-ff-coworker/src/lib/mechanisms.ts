/**
 * Anthropic Context Engineering 8 大机制
 * 出处：https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
 * 发布日期：2025-09-29
 */

export type MechanismCategory = "anatomy" | "long-horizon";

export interface Mechanism {
  id: string;
  number: number;
  nameZh: string;
  nameEn: string;
  category: MechanismCategory;
  categoryLabel: string;
  icon: string;              // emoji
  glyph: string;             // 象征物（中文两字）
  summary: string;           // 一句话小白解释
  flowIn: string;            // 输入
  flowStep: string;          // 中间处理
  flowOut: string;           // 输出
  visualMetaphor: string;    // 前端可视化隐喻
  hermesModule: string;      // Hermes 对应模块
  anthropicQuote: string;    // 官方原文金句
}

export const mechanisms: Mechanism[] = [
  {
    id: "system-prompt",
    number: 1,
    nameZh: "系统提示",
    nameEn: "System Prompts",
    category: "anatomy",
    categoryLabel: "上下文组成",
    icon: "📜",
    glyph: "工牌",
    summary: "告诉员工你是谁、要做什么、输出什么样——分节组织，不要硬编码也不要太模糊。",
    flowIn: "任务意图 + 岗位职责",
    flowStep: "分节构造 · XML/Markdown 结构化",
    flowOut: "高信号指令注入 context 顶部",
    visualMetaphor: "员工胸前的纸质工牌 · 分为 background / 工具使用说明 / 输出要求 三栏",
    hermesModule: "agent/ · instance instruction",
    anthropicQuote: "Specific enough to guide behavior, flexible enough to give strong heuristics.",
  },
  {
    id: "tools",
    number: 2,
    nameZh: "工具定义",
    nameEn: "Tools",
    category: "anatomy",
    categoryLabel: "上下文组成",
    icon: "🔧",
    glyph: "工架",
    summary: "员工能用哪些工具、参数是什么——每把工具职责清晰、不重叠。",
    flowIn: "可用工具的 schema 清单",
    flowStep: "LLM 选择工具 · 填参数 · 调用",
    flowOut: "token 精简的工具返回结果",
    visualMetaphor: "工位旁的工具架 · 选用工具时图标亮起",
    hermesModule: "tools.py · toolsets.py · MCP 适配",
    anthropicQuote: "Tools define the contract between agents and their information/action space.",
  },
  {
    id: "few-shot",
    number: 3,
    nameZh: "范例提示",
    nameEn: "Few-Shot Examples",
    category: "anatomy",
    categoryLabel: "上下文组成",
    icon: "📑",
    glyph: "便签",
    summary: "给员工看 3-5 个做过的最佳范例——不要堆砌所有边界情况。",
    flowIn: "任务类型",
    flowStep: "从范例库挑 canonical 案例",
    flowOut: "input/output 对嵌入 prompt",
    visualMetaphor: "工位桌上的一叠便签条 · 点开放大看输入输出",
    hermesModule: "skill 的 DESCRIPTION.md 示例段",
    anthropicQuote: "Examples are the 'pictures' worth a thousand words.",
  },
  {
    id: "message-history",
    number: 4,
    nameZh: "消息历史",
    nameEn: "Message History",
    category: "anatomy",
    categoryLabel: "上下文组成",
    icon: "⏳",
    glyph: "时轴",
    summary: "整段对话和工具调用轨迹——要循环精炼，不能线性堆积。",
    flowIn: "累积的消息 + 工具结果",
    flowStep: "按时间追加 · 超阈值触发清理",
    flowOut: "精炼后的上下文快照",
    visualMetaphor: "员工头顶的思维流时间条 · 新消息从右滑入，旧消息淡化",
    hermesModule: "hermes_state.py · FTS5 搜索",
    anthropicQuote: "Context must be cyclically refined, not just accumulated.",
  },
  {
    id: "jit-retrieval",
    number: 5,
    nameZh: "按需检索",
    nameEn: "Just-in-Time Retrieval",
    category: "long-horizon",
    categoryLabel: "长时策略",
    icon: "🗂",
    glyph: "文件墙",
    summary: "不预加载数据——保留路径和查询，运行时再 grep 按需读。",
    flowIn: "任务需要数据的信号",
    flowStep: "grep/glob 探路 · 元数据决策",
    flowOut: "只把真正需要的文件注入 context",
    visualMetaphor: "员工身后一面文件墙 · 探索时只亮目录路径，确认需要才打开文件",
    hermesModule: "tools.py 的 bash/grep/glob",
    anthropicQuote: "Lightweight identifiers, dynamically loaded at runtime.",
  },
  {
    id: "compaction",
    number: 6,
    nameZh: "上下文压缩",
    nameEn: "Compaction",
    category: "long-horizon",
    categoryLabel: "长时策略",
    icon: "📦",
    glyph: "档案柜",
    summary: "接近 context 上限时，让模型自己总结，然后开新窗口续命。",
    flowIn: "接近 token 上限的消息流",
    flowStep: "LLM 自省式 summarize",
    flowOut: "精炼 summary + 最近访问的 5 个文件",
    visualMetaphor: "工位背后的档案柜 · 消息泡泡像折纸一样折进抽屉 · 留下一张 Summary 卡片",
    hermesModule: "trajectory_compressor.py",
    anthropicQuote: "Summarize the most critical details while discarding redundant tool outputs.",
  },
  {
    id: "notes",
    number: 7,
    nameZh: "结构化笔记",
    nameEn: "Structured Note-taking",
    category: "long-horizon",
    categoryLabel: "长时策略",
    icon: "📓",
    glyph: "日志本",
    summary: "员工主动把关键信息写到 context 外的文件——跨 session 持久记忆。",
    flowIn: "值得长期记住的信息",
    flowStep: "调 memory tool 写入外部文件",
    flowOut: "重启后从笔记恢复工作状态",
    visualMetaphor: "工位桌上的日志本 · 翻页写字动画 · 飞书切换时本子不丢",
    hermesModule: "hermes_state.py + Honcho modeling",
    anthropicQuote: "The agent regularly writes notes persisted to memory outside of the context window.",
  },
  {
    id: "sub-agents",
    number: 8,
    nameZh: "子 Agent 架构",
    nameEn: "Sub-agent Architectures",
    category: "long-horizon",
    categoryLabel: "长时策略",
    icon: "👥",
    glyph: "分身",
    summary: "主员工 spawn 专精子员工——每个子员工独立上下文，干完返回 1000 字简报。",
    flowIn: "复杂任务 + 主 agent 的 plan",
    flowStep: "spawn 子 agent（独立 context）· 并行深挖",
    flowOut: "1000-2000 token 的 distilled summary",
    visualMetaphor: "主员工头上飞出一只小分身鸟 · 飞到副工位埋头干 · 完事飞回带回简报",
    hermesModule: "acp_adapter/ · acp_registry/（ACP 协议）",
    anthropicQuote: "Clean context windows for each sub-agent · substantial improvement over single-agent.",
  },
];

export const getMechanism = (id: string) => mechanisms.find((m) => m.id === id);
