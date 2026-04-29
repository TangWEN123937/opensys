/**
 * OpenSys 前端类型定义
 */

// ==================== SSE 事件类型 ====================

/** SSE 事件联合类型 */
export type SSEEvent =
  | { type: 'thread_id'; thread_id: string; is_new: boolean }
  | { type: 'token'; content: string; node?: string }
  | { type: 'reasoning'; content: string; node?: string }
  | { type: 'tool_start'; tool_name: string; node?: string; args_summary?: string }
  | { type: 'tool_end'; tool_name: string; output: string; node?: string }
  | { type: 'node_enter'; node: string }
  | { type: 'node_exit'; node: string }
  | { type: 'phase_update'; current_phase: number; total_phases: number; phase_name: string; phase_method: string; phase_status: string }
  | { type: 'skill_loaded'; skill_name: string; display_name: string; node: string; phase: number | null }
  | { type: 'browser_step'; step_number: number; actions: BrowserAction[]; evaluation: string; memory: string; next_goal: string; page_url: string }
  | { type: 'token_usage'; node: string; input_tokens: number; output_tokens: number }
  | { type: 'approval_request'; thread_id: string; data: Record<string, unknown> }
  | { type: 'done'; thread_id: string }
  | { type: 'error'; message: string }

// ==================== 聊天消息 ====================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 深度思考内容 */
  reasoning?: string
  timestamp: number
  /** 工具调用信息 */
  toolCalls?: ToolCallInfo[]
  /** 浏览器操作步骤（browser 节点执行时实时填充） */
  browserSteps?: BrowserStepInfo[]
}

export interface ToolCallInfo {
  name: string
  status: 'running' | 'done'
  output?: string
}

// ==================== 浏览器步骤 ====================

/** 浏览器 Agent 单个 action */
export interface BrowserAction {
  name: string
  params: Record<string, unknown>
}

/** 浏览器 Agent 单步执行信息 */
export interface BrowserStepInfo {
  stepNumber: number
  actions: BrowserAction[]
  evaluation: string
  nextGoal: string
  pageUrl: string
}

// ==================== 流程图 ====================

export interface TopologyNode {
  id: string
  label: string
  /** core = 核心流程, pipeline = P3 子代理 */
  type: 'core' | 'pipeline'
}

export interface TopologyEdge {
  source: string
  target: string
  label: string
  type?: 'conditional'
}

export interface GraphTopology {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
}

// ==================== 技能 ====================

export interface SkillInfo {
  dir_name: string
  category: string
  name: string
  description: string
  summary: string
  target_role: string
  triggers: string[]
  path: string
  char_count: number
}

// ==================== 阶段信息 ====================

export interface PhaseInfo {
  current_phase: number
  total_phases: number
  phase_name: string
  phase_method: string
  phase_status: string
}

// ==================== 节点状态 ====================

export type NodeStatus = 'idle' | 'active' | 'completed'

// ==================== 团队办公室运行时类型 ====================

/** 单个成员的实时运行状态 */
export interface MemberRuntime {
  /** 当前节点状态 */
  status: NodeStatus
  /** 工具调用次数 */
  toolCount: number
  /** 当前正在调用的工具名 */
  currentTool: string
  /** 最近的思考内容（截取最后 120 字符） */
  latestThinking: string
  /** 累计输入 token */
  inputTokens: number
  /** 累计输出 token */
  outputTokens: number
  /** 产出物数量（工具调用完成计数） */
  artifacts: number
  /** 进入时间戳（用于计算耗时） */
  enterTime: number
  /** 退出时间戳 */
  exitTime: number
}

/** 初始化一个空白成员运行时状态 */
export function emptyMemberRuntime(): MemberRuntime {
  return {
    status: 'idle',
    toolCount: 0,
    currentTool: '',
    latestThinking: '',
    inputTokens: 0,
    outputTokens: 0,
    artifacts: 0,
    enterTime: 0,
    exitTime: 0,
  }
}

/** 全员事件流单条事件 */
export interface TeamEvent {
  /** 唯一 ID */
  id: string
  /** 来源节点 ID */
  from: string
  /** 事件类型 */
  kind: 'node' | 'tool' | 'phase' | 'token_usage' | 'skill' | 'error' | 'done'
  /** 事件描述文本 */
  text: string
  /** 时间戳 */
  timestamp: number
}

/** 全局聚合统计 */
export interface GlobalAggregates {
  /** 工具调用总数 */
  totalTools: number
  /** 输入 token 总数 */
  totalInputTokens: number
  /** 输出 token 总数 */
  totalOutputTokens: number
  /** 流开始时间戳 */
  streamStartTime: number
  /** 活跃节点数 */
  activeNodes: number
}
