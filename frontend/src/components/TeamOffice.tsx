/**
 * 团队办公室主视图
 *
 * 中间区域核心组件，支持两种视图切换：
 * 1. 办公室视图（卡片墙）：按分组展示 11 个成员卡片
 * 2. 流程图视图（FlowGraph）：原有的节点拓扑图
 *
 * 顶部包含视图切换按钮。
 */

import { useState, memo } from 'react'
import { LayoutGrid, GitBranch } from 'lucide-react'
import { MEMBERS, getMembersByGroup } from '../lib/members'
import type { MemberRuntime, NodeStatus, PhaseInfo, TeamEvent } from '../types'
import MemberCard from './MemberCard'
import MemberDetail from './MemberDetail'
import FlowGraph from './FlowGraph'

interface TeamOfficeProps {
  /** 成员运行时状态 */
  memberStates: Record<string, MemberRuntime>
  /** 节点状态（FlowGraph 使用） */
  nodeStates: Record<string, NodeStatus>
  /** 阶段信息（FlowGraph 使用） */
  phaseInfo: PhaseInfo | null
  /** 全员事件流（MemberDetail 使用） */
  eventFeed: TeamEvent[]
}

/** 视图模式 */
type ViewMode = 'office' | 'flow'

function TeamOffice({ memberStates, nodeStates, phaseInfo, eventFeed }: TeamOfficeProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('office')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  // 分组成员
  const coreMembers = getMembersByGroup('core')
  const pipelineMembers = getMembersByGroup('pipeline')

  // 选中的成员配置
  const selectedMember = selectedMemberId ? MEMBERS.find(m => m.id === selectedMemberId) : null

  return (
    <div className="flex flex-col h-full">
      {/* 视图切换栏 */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--color-border)] shrink-0">
        <button
          onClick={() => setViewMode('office')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
            viewMode === 'office'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-muted)] hover:bg-white/5'
          }`}
        >
          <LayoutGrid size={13} />
          <span>办公室</span>
        </button>
        <button
          onClick={() => setViewMode('flow')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
            viewMode === 'flow'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-muted)] hover:bg-white/5'
          }`}
        >
          <GitBranch size={13} />
          <span>流程图</span>
        </button>

        {/* 活跃成员指示器 */}
        <div className="ml-auto flex items-center gap-1">
          {MEMBERS.filter(m => memberStates[m.id]?.status === 'active').map(m => (
            <span
              key={m.id}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold animate-pulse"
              style={{ backgroundColor: m.bgColor, color: m.accent }}
              title={`${m.name} 工作中`}
            >
              {m.initials}
            </span>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden relative">
        {viewMode === 'office' ? (
          /* 办公室视图：卡片网格 */
          <div className="h-full overflow-y-auto p-3">
            {/* 核心流程成员 */}
            <div className="mb-3">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-2 px-1">
                核心流程
              </div>
              <div className="grid grid-cols-3 gap-2">
                {coreMembers.map((m) => (
                  <MemberCard
                    key={m.id}
                    config={m}
                    runtime={memberStates[m.id]}
                    onClick={() => setSelectedMemberId(selectedMemberId === m.id ? null : m.id)}
                  />
                ))}
              </div>
            </div>

            {/* Pipeline 子代理 */}
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-2 px-1">
                Pipeline 子代理
              </div>
              <div className="grid grid-cols-3 gap-2">
                {pipelineMembers.map((m) => (
                  <MemberCard
                    key={m.id}
                    config={m}
                    runtime={memberStates[m.id]}
                    onClick={() => setSelectedMemberId(selectedMemberId === m.id ? null : m.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* 流程图视图 */
          <FlowGraph nodeStates={nodeStates} phaseInfo={phaseInfo} />
        )}
      </div>

      {/* 成员详情抽屉（底部滑出） */}
      {selectedMember && (
        <MemberDetail
          config={selectedMember}
          runtime={memberStates[selectedMember.id]}
          allEvents={eventFeed}
          onClose={() => setSelectedMemberId(null)}
        />
      )}
    </div>
  )
}

export default memo(TeamOffice)
