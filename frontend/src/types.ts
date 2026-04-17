/**
 * OpenSys 前端类型定义
 */

// ==================== SSE 事件类型 ====================

/** SSE 事件联合类型 */
export type SSEEvent =
  | { type: 'thread_id'; thread_id: string; is_new: boolean }
  | { type: 'token'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_start'; tool_name: string }
  | { type: 'tool_end'; tool_name: string; output: string }
  | { type: 'node_enter'; node: string }
  | { type: 'node_exit'; node: string }
  | { type: 'phase_update'; current_phase: number; total_phases: number; phase_name: string; phase_method: string; phase_status: string }
  | { type: 'skill_loaded'; skill_name: string; display_name: string; node: string; phase: number | null }
  | { type: 'browser_step'; step_number: number; actions: BrowserAction[]; evaluation: string; memory: string; next_goal: string; page_url: string }
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
