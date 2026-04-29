/**
 * 执行流程图
 *
 * 右上区域：使用 React Flow 绘制 LangGraph 节点拓扑，
 * 根据 SSE node_enter/node_exit 事件实时高亮当前活跃节点。
 * 自定义节点支持鼠标悬浮 tooltip 说明。
 * 右上角 ❗ 按钮可切换到项目说明页面。
 */

import { useEffect, useState, memo } from 'react'
import {
  ReactFlow,
  Background,
  Handle,
  type Node,
  type Edge,
  type NodeProps,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CircleAlert, ArrowLeft } from 'lucide-react'
import type { NodeStatus, PhaseInfo } from '../types'
import WorkflowPanel from './WorkflowPanel'

interface FlowGraphProps {
  nodeStates: Record<string, NodeStatus>
  phaseInfo: PhaseInfo | null
}

// ==================== 节点配置数据（竖向布局）====================

interface NodeConfig {
  /** 显示名称 */
  label: string
  /** 鼠标悬浮时的简短介绍 */
  tooltip: string
  /** 布局坐标 */
  x: number; y: number
  /** 节点类型 */
  group: 'start' | 'core' | 'pipeline'
}

/**
 * 节点布局（竖向，上→下）
 *
 * 整体结构：
 *   - 顶部：起点（用户输入）→ Agent（主路由）
 *   - 左列（x≈40）：简单问答主流程 · 风险评估 → 工具执行，带审批分支
 *   - 右列（x≈420）：复杂任务 Pipeline · Advisor → Dispatcher → Executor → Reviewer → Phase Done
 */
const NODE_CONFIG: Record<string, NodeConfig> = {
  // === 起点 ===
  start: {
    label: '💬 用户输入',
    tooltip: '起点：你在左侧聊天框输入的消息，AI 从这里开始处理。',
    x: 200, y: 0, group: 'start',
  },
  agent: {
    label: 'Agent',
    tooltip: '主代理：读取你的消息后决定走向——直接回复、调用工具（走左侧），或启动多阶段任务（走右侧）。',
    x: 200, y: 110, group: 'core',
  },

  // === 左列：简单问答主流程 ===
  risk_assessment: {
    label: '风险评估',
    tooltip: '安全卫士：检查 AI 要执行的操作是否安全。高风险操作（如删除文件）会转到审批。',
    x: 40, y: 260, group: 'core',
  },
  tools: {
    label: '工具执行',
    tooltip: '工具箱：执行具体操作，比如搜索网页、读写文件、运行代码等。执行完回到 Agent。',
    x: 40, y: 400, group: 'core',
  },
  approval: {
    label: '审批',
    tooltip: '等你拍板：高风险操作需要你确认后才会执行，你可以批准、修改或拒绝。',
    x: 210, y: 330, group: 'core',
  },
  rejection: {
    label: '拒绝',
    tooltip: '打回去：你拒绝了某个操作，AI 会收到反馈并换个方式处理。',
    x: 210, y: 450, group: 'core',
  },

  // === 右列：Pipeline 复杂任务流程 ===
  advisor: {
    label: 'Advisor',
    tooltip: '策划师：把复杂任务拆分成多个阶段，制定执行计划。比如"写一篇文章"会被拆成调研→写作→审查。',
    x: 420, y: 260, group: 'pipeline',
  },
  dispatcher: {
    label: 'Dispatcher',
    tooltip: '调度员：根据计划分配子任务给 Executor 执行，可以并行派发多个任务。',
    x: 420, y: 380, group: 'pipeline',
  },
  executor: {
    label: 'Executor',
    tooltip: '执行者：按照计划一步步完成具体工作，比如搜索资料、撰写内容等。',
    x: 420, y: 500, group: 'pipeline',
  },
  reviewer: {
    label: 'Reviewer',
    tooltip: '审查官：检查执行结果的质量，不合格会打回重做，严重问题会要求重新规划。',
    x: 420, y: 620, group: 'pipeline',
  },
  phase_done: {
    label: 'Phase Done',
    tooltip: '阶段推进：一个阶段完成后，决定继续下一阶段、打回重做、还是全部完成返回主代理。',
    x: 420, y: 740, group: 'pipeline',
  },
  browser: {
    label: 'Browser',
    tooltip: '浏览器操作员：自动打开网页完成操作，比如发邮件、发文章、下载文件等。会参考"技能"文件中的操作指南。',
    x: 590, y: 500, group: 'pipeline',
  },
}

/** 区域标题节点（非交互，仅视觉分区） */
const SECTION_TITLES = [
  { id: 'title_simple', label: '🎯  简单问答主流程', x: 10, y: 200, color: '#60a5fa' },
  { id: 'title_pipeline', label: '🔄  复杂任务 Pipeline', x: 400, y: 200, color: '#22d3ee' },
]

// ==================== 自定义节点组件（带 tooltip） ====================

/** 自定义节点 data 类型 */
type TooltipNodeData = { label: string; tooltip: string; nodeGroup: string; nodeStatus: NodeStatus }

/** 节点样式计算（根据 group 选配色方案） */
function getNodeColors(status: NodeStatus, group: string) {
  let colors
  if (group === 'pipeline') {
    colors = { idle: '#164e63', active: '#06b6d4', completed: '#0e7490', border: '#22d3ee', idleBorder: '#334155' }
  } else if (group === 'start') {
    // 起点节点：绿色系突出
    colors = { idle: '#14532d', active: '#22c55e', completed: '#166534', border: '#4ade80', idleBorder: '#4ade80' }
  } else {
    // core
    colors = { idle: '#1e3a5f', active: '#3b82f6', completed: '#1d4ed8', border: '#60a5fa', idleBorder: '#334155' }
  }

  switch (status) {
    case 'active':
      return { bg: colors.active, border: colors.border, text: '#fff', shadow: `0 0 16px ${colors.border}88` }
    case 'completed':
      return { bg: colors.completed, border: colors.completed, text: '#cbd5e1', shadow: 'none' }
    default:
      return {
        bg: colors.idle,
        border: colors.idleBorder,
        text: group === 'start' ? '#4ade80' : '#94a3b8',
        shadow: group === 'start' ? `0 0 10px ${colors.border}44` : 'none',
      }
  }
}

/** 带 Tooltip 的自定义节点 */
const TooltipNode = memo(({ data }: NodeProps<Node<TooltipNodeData>>) => {
  const [showTip, setShowTip] = useState(false)
  const c = getNodeColors(data.nodeStatus || 'idle', data.nodeGroup || 'core')

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      {/* 入口连接点 */}
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-1.5 !h-1.5 !border-0" />
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-1.5 !h-1.5 !border-0" />

      {/* 节点主体 */}
      <div
        className={`px-4 py-2 rounded-[10px] border-2 text-xs font-semibold text-center min-w-[100px] transition-all duration-300 ${
          data.nodeStatus === 'active' ? 'animate-pulse' : ''
        }`}
        style={{ background: c.bg, borderColor: c.border, color: c.text, boxShadow: c.shadow }}
      >
        {data.label}
      </div>

      {/* 出口连接点 */}
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-1.5 !h-1.5 !border-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-1.5 !h-1.5 !border-0" />

      {/* Tooltip 气泡 */}
      {showTip && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 shadow-xl text-xs text-slate-200 leading-relaxed pointer-events-none">
          {data.tooltip}
          {/* 小箭头 */}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-600" />
        </div>
      )}
    </div>
  )
})
TooltipNode.displayName = 'TooltipNode'

/** 区域标题节点（非交互，仅用于视觉分区） */
const SectionTitleNode = memo(({ data }: NodeProps<Node<{ label: string; color: string }>>) => (
  <div
    className="px-3 py-1 text-xs font-bold uppercase tracking-wider select-none"
    style={{
      color: data.color,
      borderBottom: `2px dashed ${data.color}55`,
      minWidth: 160,
    }}
  >
    {data.label}
  </div>
))
SectionTitleNode.displayName = 'SectionTitleNode'

/** 注册自定义节点类型 */
const nodeTypes = { tooltipNode: TooltipNode, sectionTitle: SectionTitleNode }

// ==================== 静态边定义（竖向流向）====================

const STATIC_EDGES: Array<{
  id: string; source: string; target: string;
  label?: string; dashed?: boolean; type?: 'default' | 'smoothstep'
}> = [
  // ⓪ 起点 → Agent
  { id: 'e-start-agent',      source: 'start',           target: 'agent',           type: 'smoothstep' },

  // ① 左列：Agent → 风险评估 → 工具执行（主流向，直下）
  { id: 'e-agent-risk',       source: 'agent',           target: 'risk_assessment', label: '工具调用', type: 'smoothstep' },
  { id: 'e-risk-tools',       source: 'risk_assessment', target: 'tools',           label: 'safe', type: 'smoothstep' },

  // ② 左列审批分支
  { id: 'e-risk-approval',    source: 'risk_assessment', target: 'approval',        label: '需审批', dashed: true, type: 'smoothstep' },
  { id: 'e-approval-tools',   source: 'approval',        target: 'tools',           label: '通过', type: 'smoothstep' },
  { id: 'e-approval-reject',  source: 'approval',        target: 'rejection',       label: '拒绝', dashed: true, type: 'smoothstep' },

  // ③ 左列返回（工具/拒绝 → Agent 循环）
  { id: 'e-tools-agent',      source: 'tools',           target: 'agent',           label: '返回', dashed: true, type: 'smoothstep' },
  { id: 'e-reject-agent',     source: 'rejection',       target: 'agent',           dashed: true, type: 'smoothstep' },

  // ④ Agent → Advisor 进入 Pipeline（跨列）
  { id: 'e-agent-advisor',    source: 'agent',           target: 'advisor',         label: '规划', dashed: true, type: 'smoothstep' },

  // ⑤ 右列 Pipeline 主链（直下）
  { id: 'e-advisor-disp',     source: 'advisor',         target: 'dispatcher',      type: 'smoothstep' },
  { id: 'e-disp-exec',        source: 'dispatcher',      target: 'executor',        type: 'smoothstep' },
  { id: 'e-exec-review',      source: 'executor',        target: 'reviewer',        type: 'smoothstep' },
  { id: 'e-review-phasedone', source: 'reviewer',        target: 'phase_done',      type: 'smoothstep' },

  // ⑥ 右列 Browser 分支（Dispatcher → Browser → Phase Done）
  { id: 'e-disp-browser',     source: 'dispatcher',      target: 'browser',         label: 'browser', dashed: true, type: 'smoothstep' },
  { id: 'e-browser-pd',       source: 'browser',         target: 'phase_done',      dashed: true, type: 'smoothstep' },

  // ⑦ Pipeline 循环（Phase Done → Advisor 下一阶段）
  { id: 'e-pd-advisor',       source: 'phase_done',      target: 'advisor',         label: '下一阶段', dashed: true, type: 'smoothstep' },

  // ⑧ Pipeline 完成 → Agent（跨列长连线）
  { id: 'e-pd-agent',         source: 'phase_done',      target: 'agent',           label: '全部完成', dashed: true, type: 'smoothstep' },
]

// ==================== 项目说明页面 ====================

function HelpPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full overflow-y-auto px-5 py-4 text-sm text-[var(--color-text)] leading-relaxed space-y-5">
      {/* 返回按钮 */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline mb-2"
      >
        <ArrowLeft size={14} />
        返回流程图
      </button>

      {/* 标题 */}
      <div>
        <h2 className="text-lg font-bold text-white mb-1">OpenSys AI Agent — 项目说明</h2>
        <p className="text-[var(--color-text-muted)] text-xs">帮助你理解流程图中每一步在做什么，以及如何训练和修改技能。</p>
      </div>

      {/* 一句话介绍 */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-accent)] mb-1">这是什么？</h3>
        <p>
          OpenSys 是一个 AI 助手，你对它说一句话（比如"帮我发一封邮件"），
          它就会<strong>自动拆解任务、执行操作、检查结果</strong>——整个过程你在左边的聊天区就能看到。
        </p>
        <p className="mt-1">
          右边的流程图展示的就是 AI 内部的"思考路径"，每个方块代表一个处理步骤。
          <strong>方块亮起来</strong>表示 AI 正在执行那一步。
        </p>
      </section>

      {/* 流程图的两种模式 */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-accent)] mb-1">两种工作模式</h3>

        <div className="space-y-3 mt-2">
          <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
            <p className="font-semibold text-blue-400 mb-1">模式一：简单问答（上半部分）</p>
            <p>比如你问"今天天气怎么样"或"帮我搜个资料"，AI 走的是上面这条路：</p>
            <ol className="list-decimal list-inside mt-1 ml-2 space-y-0.5 text-[var(--color-text-muted)]">
              <li><strong className="text-[var(--color-text)]">Agent</strong> 收到你的消息，决定需要调用工具</li>
              <li><strong className="text-[var(--color-text)]">风险评估</strong> 检查操作是否安全</li>
              <li>安全的话直接去 <strong className="text-[var(--color-text)]">工具执行</strong>；危险的话先找你 <strong className="text-[var(--color-text)]">审批</strong></li>
              <li>工具执行完，结果返回给 Agent，Agent 整理后回复你</li>
            </ol>
          </div>

          <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
            <p className="font-semibold text-cyan-400 mb-1">模式二：复杂任务（下半部分）</p>
            <p>比如你说"帮我写一篇公众号文章并发布"，AI 会走下面的流水线：</p>
            <ol className="list-decimal list-inside mt-1 ml-2 space-y-0.5 text-[var(--color-text-muted)]">
              <li><strong className="text-[var(--color-text)]">Advisor</strong> 制定计划：调研 → 写作 → 审查 → 发布</li>
              <li><strong className="text-[var(--color-text)]">Dispatcher</strong> 分配任务给执行者</li>
              <li><strong className="text-[var(--color-text)]">Executor</strong> 一步步完成（搜索资料、撰写内容等）</li>
              <li><strong className="text-[var(--color-text)]">Reviewer</strong> 检查质量，不合格就打回重做</li>
              <li><strong className="text-[var(--color-text)]">Browser</strong> 如果需要网页操作（如发邮件、发文章），会自动打开浏览器</li>
              <li><strong className="text-[var(--color-text)]">Phase Done</strong> 一个阶段做完，推进到下一阶段</li>
            </ol>
          </div>
        </div>
      </section>

      {/* 举例说明 */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-accent)] mb-1">举个例子</h3>
        <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)]">
          <p className="mb-1">你说：<strong className="text-white">"帮我用 QQ 邮箱给张三发一封邮件"</strong></p>
          <p className="text-[var(--color-text-muted)]">AI 内部的执行路径：</p>
          <div className="mt-1 ml-2 text-xs text-[var(--color-text-muted)] space-y-0.5">
            <p>1️⃣ <strong className="text-white">Agent</strong> → 判断这是复杂任务，需要规划</p>
            <p>2️⃣ <strong className="text-cyan-400">Advisor</strong> → 制定计划：打开 QQ 邮箱 → 写信 → 发送</p>
            <p>3️⃣ <strong className="text-cyan-400">Browser</strong> → 自动打开浏览器，登录 QQ 邮箱，填写收件人、主题、内容，点击发送</p>
            <p>4️⃣ <strong className="text-cyan-400">Reviewer</strong> → 检查是否发送成功</p>
            <p>5️⃣ <strong className="text-white">Agent</strong> → 回复你"邮件已发送"</p>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            在第 3 步中，Browser 会参考 <strong className="text-[var(--color-accent)]">QQ邮箱操作</strong> 这个技能文件中的操作指南（SOP），
            按照里面写的步骤一步步操作。如果操作指南不准确，AI 可能会出错——<strong className="text-white">这就是你需要修改技能的原因。</strong>
          </p>
        </div>
      </section>

      {/* 什么是技能 */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-accent)] mb-1">什么是"技能"？</h3>
        <p>
          技能（Skill）是一份操作指南文件（SKILL.md），教 AI 怎么完成某类任务。
          就像你给新员工写的<strong>标准操作流程（SOP）</strong>。
        </p>
        <p className="mt-1">比如 <strong className="text-white">QQ邮箱操作</strong> 这个技能会告诉 AI：</p>
        <ul className="list-disc list-inside ml-2 mt-1 text-[var(--color-text-muted)] space-y-0.5">
          <li>打开哪个网址</li>
          <li>在哪个输入框填写收件人</li>
          <li>怎么点击发送按钮</li>
          <li>发送后如何确认成功</li>
          <li>常见错误怎么处理</li>
        </ul>
        <p className="mt-2 text-[var(--color-warning)]">
          如果 AI 在某个网页操作上老是出错，大概率是技能文件写得不够好——修改它就能改善 AI 的表现。
        </p>
      </section>

      {/* 如何修改技能 */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-accent)] mb-1">如何查看和修改技能？</h3>
        <div className="space-y-2 mt-2">
          <div className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">1</span>
            <p>看右下角的<strong className="text-white">技能面板</strong>，里面列出了所有技能标签。绿色高亮的表示当前任务正在使用。</p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">2</span>
            <p><strong className="text-white">点击任意技能标签</strong>，会弹出编辑器，显示该技能的 SKILL.md 文件内容。</p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">3</span>
            <p><strong className="text-white">直接修改内容</strong>，比如补充操作步骤、修正错误的按钮名称、添加注意事项等。</p>
          </div>
          <div className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">4</span>
            <p>点击<strong className="text-white">保存</strong>按钮。下次 AI 执行类似任务时，就会使用你更新后的操作指南。</p>
          </div>
        </div>
      </section>

      {/* 修改技巧 */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-accent)] mb-1">修改技能的小技巧</h3>
        <ul className="list-disc list-inside ml-2 text-[var(--color-text-muted)] space-y-1">
          <li>写得越<strong className="text-white">具体</strong>越好——"点击页面右上角蓝色的发送按钮"比"点击发送"好</li>
          <li>加上<strong className="text-white">常见错误</strong>处理——"如果弹出验证码，等待用户手动处理"</li>
          <li>标明<strong className="text-white">禁止事项</strong>——"不要重复点击提交按钮"</li>
          <li>如果网站改版了，及时<strong className="text-white">更新按钮名称和页面结构</strong>描述</li>
          <li>可以参考已有的技能文件格式，照着改就行</li>
        </ul>
      </section>

      {/* 图例 */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--color-accent)] mb-1">流程图图例</h3>
        <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#1e3a5f] border-2 border-[#334155]" />
            <span className="text-[var(--color-text-muted)]">核心节点（待机）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#164e63] border-2 border-[#334155]" />
            <span className="text-[var(--color-text-muted)]">Pipeline 节点（待机）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#3b82f6] border-2 border-[#60a5fa] shadow-[0_0_8px_#60a5fa88]" />
            <span className="text-[var(--color-text-muted)]">正在执行（发光闪烁）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#1d4ed8] border-2 border-[#1d4ed8]" />
            <span className="text-[var(--color-text-muted)]">已完成</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 border-t-2 border-[#64748b]" />
            <span className="text-[var(--color-text-muted)]">主流向（实线）</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 border-t-2 border-dashed border-[#475569]" />
            <span className="text-[var(--color-text-muted)]">条件分支（虚线）</span>
          </div>
        </div>
      </section>

      {/* 底部留白 */}
      <div className="h-4" />
    </div>
  )
}

// ==================== 主组件 ====================

export default function FlowGraph({ nodeStates, phaseInfo }: FlowGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  /** 是否显示帮助说明页面 */
  const [showHelp, setShowHelp] = useState(false)

  // 初始化节点和边（只执行一次）
  useEffect(() => {
    // 业务节点（含起点 + 主/次流程节点）
    // 竖向布局：统一 Top→Bottom 流向，让 smoothstep 生成整洁的折线
    const rfNodes: Node[] = Object.entries(NODE_CONFIG).map(([id, cfg]) => ({
      id,
      type: 'tooltipNode',
      position: { x: cfg.x, y: cfg.y },
      data: { label: cfg.label, tooltip: cfg.tooltip, nodeGroup: cfg.group, nodeStatus: 'idle' as NodeStatus },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      selectable: false,
    }))

    // 区域标题节点（非交互，仅分区视觉）
    const titleNodes: Node[] = SECTION_TITLES.map(t => ({
      id: t.id,
      type: 'sectionTitle',
      position: { x: t.x, y: t.y },
      data: { label: t.label, color: t.color },
      draggable: false,
      selectable: false,
    }))

    // 边：默认 smoothstep 折线，适合竖向布局
    const rfEdges: Edge[] = STATIC_EDGES.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: e.type || 'smoothstep',
      animated: false,
      style: {
        stroke: e.dashed ? '#475569' : '#64748b',
        strokeWidth: e.dashed ? 1 : 1.5,
        strokeDasharray: e.dashed ? '6 3' : undefined,
      },
      labelStyle: { fontSize: 10, fill: '#94a3b8', fontWeight: 500 },
      labelBgStyle: { fill: '#0f172a', fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
      markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: e.dashed ? '#475569' : '#64748b' },
    }))

    setNodes([...titleNodes, ...rfNodes])
    setEdges(rfEdges)
  }, [setNodes, setEdges])

  // 节点状态变化时更新样式（通过 data.nodeStatus 传给自定义节点）
  useEffect(() => {
    setNodes(nds =>
      nds.map(n => {
        // 标题节点不参与状态高亮
        if (n.type !== 'tooltipNode') return n
        return {
          ...n,
          data: { ...n.data, nodeStatus: nodeStates[n.id] || 'idle' },
        }
      })
    )
    // 高亮活跃节点相关的边
    setEdges(eds =>
      eds.map(e => {
        const srcActive = nodeStates[e.source] === 'active'
        const tgtActive = nodeStates[e.target] === 'active'
        const highlight = srcActive || tgtActive
        return {
          ...e,
          animated: highlight,
          style: {
            ...e.style,
            stroke: highlight ? '#22d3ee' : (e.style?.strokeDasharray ? '#475569' : '#64748b'),
            strokeWidth: highlight ? 2.5 : (e.style?.strokeDasharray ? 1 : 1.5),
          },
        }
      })
    )
  }, [nodeStates, setNodes, setEdges])

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">🔄 执行流程</h2>
        <div className="flex items-center gap-2">
          {phaseInfo && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)]">
                Phase {phaseInfo.current_phase + 1}/{phaseInfo.total_phases}
              </span>
              <span className="text-[var(--color-text-muted)]">{phaseInfo.phase_name}</span>
              <span className="text-[var(--color-text-muted)] opacity-60">({phaseInfo.phase_method})</span>
            </div>
          )}
          {/* 我的工作流（可查看/编辑/保存，不可删除/新建） */}
          <WorkflowPanel />
          {/* 帮助按钮 */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`p-1 rounded-md transition-colors ${
              showHelp
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-warning)] hover:bg-[var(--color-surface)]'
            }`}
            title="项目说明 / 使用帮助"
          >
            <CircleAlert size={18} />
          </button>
        </div>
      </div>

      {/* 内容区：流程图 或 帮助说明 */}
      <div className="flex-1 overflow-hidden">
        {showHelp ? (
          <HelpPage onBack={() => setShowHelp(false)} />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.4}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            panOnDrag
            zoomOnScroll
          >
            <Background color="#1e293b" gap={24} />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
