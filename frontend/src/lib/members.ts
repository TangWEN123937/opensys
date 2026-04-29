/**
 * 11 个 LangGraph 节点 → 团队成员静态配置
 *
 * 每个节点映射为一个"AI 团队成员"，包含角色名、颜色、图标、简介等。
 * 数据来源：FlowGraph.tsx 的 NODE_CONFIG + 项目架构知识。
 */

/** 成员静态配置 */
export interface MemberConfig {
  /** LangGraph 节点 ID */
  id: string
  /** 中文角色名 */
  name: string
  /** 角色标签（英文简称） */
  role: string
  /** 头像上显示的字符 */
  initials: string
  /** 头像底色 */
  bgColor: string
  /** 头像文字颜色 */
  accent: string
  /** 卡片图标 emoji */
  icon: string
  /** 简短介绍（一句话） */
  tooltip: string
  /** 所属分组 */
  group: 'core' | 'pipeline'
}

/**
 * 全部 11 个成员配置
 *
 * 分两组：
 * - core（5 个）：主流程节点 — Agent, 风险评估, 审批, 拒绝, 工具执行
 * - pipeline（6 个）：P3 子代理 — Advisor, Dispatcher, Executor, Reviewer, Phase Done, Browser
 */
export const MEMBERS: MemberConfig[] = [
  // === 核心主流程 ===
  {
    id: 'agent',
    name: '主代理',
    role: 'Agent',
    initials: 'A',
    bgColor: '#3b82f6',
    accent: '#ffffff',
    icon: '🧠',
    tooltip: '读取消息后决定走向——直接回复、调用工具，或启动多阶段任务。',
    group: 'core',
  },
  {
    id: 'risk_assessment',
    name: '风险评估',
    role: 'Risk',
    initials: '风',
    bgColor: '#f59e0b',
    accent: '#ffffff',
    icon: '🛡️',
    tooltip: '检查 AI 要执行的操作是否安全，高风险操作转到审批。',
    group: 'core',
  },
  {
    id: 'approval',
    name: '审批',
    role: 'Approval',
    initials: '批',
    bgColor: '#22c55e',
    accent: '#ffffff',
    icon: '✅',
    tooltip: '高风险操作需要用户确认后才会执行。',
    group: 'core',
  },
  {
    id: 'rejection',
    name: '拒绝',
    role: 'Reject',
    initials: '拒',
    bgColor: '#ef4444',
    accent: '#ffffff',
    icon: '❌',
    tooltip: '用户拒绝了某个操作，AI 会换个方式处理。',
    group: 'core',
  },
  {
    id: 'tools',
    name: '工具执行',
    role: 'Tools',
    initials: '工',
    bgColor: '#8b5cf6',
    accent: '#ffffff',
    icon: '🔧',
    tooltip: '执行具体操作：搜索网页、读写文件、运行代码等。',
    group: 'core',
  },

  // === Pipeline 子代理 ===
  {
    id: 'advisor',
    name: '策划师',
    role: 'Advisor',
    initials: '策',
    bgColor: '#06b6d4',
    accent: '#ffffff',
    icon: '📋',
    tooltip: '把复杂任务拆分成多个阶段，制定执行计划。',
    group: 'pipeline',
  },
  {
    id: 'dispatcher',
    name: '调度员',
    role: 'Dispatcher',
    initials: '调',
    bgColor: '#14b8a6',
    accent: '#ffffff',
    icon: '📡',
    tooltip: '根据计划分配子任务给 Executor 执行。',
    group: 'pipeline',
  },
  {
    id: 'executor',
    name: '执行者',
    role: 'Executor',
    initials: '执',
    bgColor: '#f97316',
    accent: '#ffffff',
    icon: '⚡',
    tooltip: '按照计划一步步完成具体工作：搜索资料、撰写内容等。',
    group: 'pipeline',
  },
  {
    id: 'reviewer',
    name: '审查官',
    role: 'Reviewer',
    initials: '审',
    bgColor: '#ec4899',
    accent: '#ffffff',
    icon: '🔍',
    tooltip: '检查执行结果质量，不合格会打回重做。',
    group: 'pipeline',
  },
  {
    id: 'phase_done',
    name: '阶段推进',
    role: 'PhaseDone',
    initials: '阶',
    bgColor: '#64748b',
    accent: '#ffffff',
    icon: '🏁',
    tooltip: '一个阶段完成后，决定继续下一阶段还是全部完成。',
    group: 'pipeline',
  },
  {
    id: 'browser',
    name: '浏览器',
    role: 'Browser',
    initials: '浏',
    bgColor: '#a855f7',
    accent: '#ffffff',
    icon: '🌐',
    tooltip: '自动打开网页完成操作：发邮件、发文章、下载文件等。',
    group: 'pipeline',
  },
]

/** 按 ID 查找成员配置 */
export function getMember(id: string): MemberConfig | undefined {
  return MEMBERS.find((m) => m.id === id)
}

/** 按分组获取成员列表 */
export function getMembersByGroup(group: 'core' | 'pipeline'): MemberConfig[] {
  return MEMBERS.filter((m) => m.group === group)
}
