/**
 * 全局统计栏组件
 *
 * 顶部横条，显示关键运行指标：
 * - 工具调用总数
 * - Token 消耗量
 * - 活跃节点数
 * - 运行时长
 * - Pipeline 阶段进度
 */

import { memo, useEffect, useState } from 'react'
import { Wrench, Zap, Radio, Clock, Layers } from 'lucide-react'
import type { GlobalAggregates, PhaseInfo } from '../types'

interface GlobalStatsProps {
  aggregates: GlobalAggregates
  phaseInfo: PhaseInfo | null
  isStreaming: boolean
}

function GlobalStats({ aggregates, phaseInfo, isStreaming }: GlobalStatsProps) {
  // 运行时长计时器
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isStreaming || !aggregates.streamStartTime) {
      setElapsed(0)
      return
    }
    // 每秒更新
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - aggregates.streamStartTime) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [isStreaming, aggregates.streamStartTime])

  /** 格式化秒数为 mm:ss */
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  /** 格式化 token 数 */
  const formatTokenCount = (n: number) => {
    if (n === 0) return '0'
    if (n < 1000) return String(n)
    if (n < 1000000) return (n / 1000).toFixed(1) + 'k'
    return (n / 1000000).toFixed(2) + 'M'
  }

  const totalTokens = aggregates.totalInputTokens + aggregates.totalOutputTokens

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 bg-[var(--color-surface)] border-b border-[var(--color-border)] text-xs shrink-0 overflow-x-auto">
      {/* 活跃节点 */}
      <StatChip
        icon={<Radio size={12} />}
        label="活跃"
        value={aggregates.activeNodes}
        highlight={aggregates.activeNodes > 0}
      />

      {/* 工具调用 */}
      <StatChip
        icon={<Wrench size={12} />}
        label="工具"
        value={aggregates.totalTools}
      />

      {/* Token 消耗 */}
      <StatChip
        icon={<Zap size={12} />}
        label="Token"
        value={formatTokenCount(totalTokens)}
        title={`输入: ${formatTokenCount(aggregates.totalInputTokens)} / 输出: ${formatTokenCount(aggregates.totalOutputTokens)}`}
      />

      {/* 运行时长 */}
      {isStreaming && (
        <StatChip
          icon={<Clock size={12} />}
          label="时长"
          value={formatTime(elapsed)}
        />
      )}

      {/* Pipeline 阶段 */}
      {phaseInfo && (
        <StatChip
          icon={<Layers size={12} />}
          label="阶段"
          value={`${phaseInfo.current_phase + 1}/${phaseInfo.total_phases}`}
          title={`${phaseInfo.phase_name}（${phaseInfo.phase_method}）`}
        />
      )}

      {/* 阶段名（额外显示） */}
      {phaseInfo && (
        <div className="flex items-center gap-1 text-[var(--color-text-muted)] ml-auto">
          <span className="text-[11px] truncate max-w-[160px]">
            {phaseInfo.phase_name}
          </span>
          <span className="text-[10px] opacity-60">
            ({phaseInfo.phase_method})
          </span>
        </div>
      )}
    </div>
  )
}

/** 单个统计指标 */
function StatChip({
  icon,
  label,
  value,
  highlight,
  title,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  highlight?: boolean
  title?: string
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded ${
        highlight ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
      }`}
      title={title}
    >
      {icon}
      <span className="text-[10px]">{label}</span>
      <span className={`text-[11px] font-medium ${highlight ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
        {value}
      </span>
    </div>
  )
}

export default memo(GlobalStats)
