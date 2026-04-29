/**
 * 成员卡片组件
 *
 * 显示单个 AI 团队成员的实时状态：
 * - 圆形头像（首字 + 底色）+ 状态灯
 * - 角色名 + 当前动作文字
 * - 工具 / Token / 产出 三列小数字
 * - 最近思考内容滚动条
 */

import { memo } from 'react'
import { Wrench, Zap, Package } from 'lucide-react'
import type { MemberConfig } from '../lib/members'
import type { MemberRuntime } from '../types'

interface MemberCardProps {
  /** 静态配置 */
  config: MemberConfig
  /** 运行时状态（可能为空 → idle） */
  runtime?: MemberRuntime
  /** 点击卡片回调 */
  onClick?: () => void
}

/** 状态灯颜色映射 */
const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-gray-500',
  active: 'bg-green-400 animate-pulse',
  completed: 'bg-blue-400',
}

/** 状态标签 */
const STATUS_LABELS: Record<string, string> = {
  idle: '空闲',
  active: '工作中',
  completed: '已完成',
}

function MemberCard({ config, runtime, onClick }: MemberCardProps) {
  const status = runtime?.status || 'idle'
  const isActive = status === 'active'

  return (
    <div
      onClick={onClick}
      className={`
        relative rounded-lg border p-3 cursor-pointer transition-all duration-200
        ${isActive
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5 shadow-md shadow-[var(--color-accent)]/10'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]'
        }
      `}
    >
      {/* 顶部：头像 + 名称 + 状态 */}
      <div className="flex items-center gap-2.5 mb-2">
        {/* 圆形头像 */}
        <div
          className="relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ backgroundColor: config.bgColor, color: config.accent }}
        >
          {config.initials}
          {/* 状态灯 */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--color-surface)] ${STATUS_COLORS[status]}`}
          />
        </div>

        {/* 名称 + 角色 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{config.icon}</span>
            <span className="text-sm font-medium text-[var(--color-text)] truncate">{config.name}</span>
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] truncate">
            {/* 当前动作 */}
            {runtime?.currentTool
              ? `⚙ ${runtime.currentTool}`
              : STATUS_LABELS[status]
            }
          </div>
        </div>
      </div>

      {/* 三列统计 */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <StatItem icon={<Wrench size={11} />} value={runtime?.toolCount || 0} label="工具" />
        <StatItem icon={<Zap size={11} />} value={formatTokens(runtime)} label="Token" />
        <StatItem icon={<Package size={11} />} value={runtime?.artifacts || 0} label="产出" />
      </div>

      {/* 最近思考内容（仅活跃时显示） */}
      {isActive && runtime?.latestThinking && (
        <div className="mt-2 text-[10px] text-[var(--color-text-muted)] leading-tight line-clamp-2 opacity-70">
          {runtime.latestThinking}
        </div>
      )}
    </div>
  )
}

/** 统计小项 */
function StatItem({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-0.5 text-[var(--color-text-muted)]">
        {icon}
        <span className="text-[11px] font-medium text-[var(--color-text)]">{value}</span>
      </div>
      <span className="text-[9px] text-[var(--color-text-muted)]">{label}</span>
    </div>
  )
}

/** 格式化 token 数字（超过 1k 显示 1.2k） */
function formatTokens(runtime?: MemberRuntime): string {
  if (!runtime) return '0'
  const total = runtime.inputTokens + runtime.outputTokens
  if (total === 0) return '0'
  if (total < 1000) return String(total)
  return (total / 1000).toFixed(1) + 'k'
}

export default memo(MemberCard)
