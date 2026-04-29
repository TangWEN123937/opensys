/**
 * 成员详情抽屉面板
 *
 * 点击卡片后从底部滑出，展示该成员的详细信息：
 * - 角色简介
 * - 实时状态 + 统计数据
 * - 该成员相关的事件日志
 */

import { memo, useMemo } from 'react'
import { X, Wrench, Zap, Package, Clock } from 'lucide-react'
import type { MemberConfig } from '../lib/members'
import type { MemberRuntime, TeamEvent } from '../types'

interface MemberDetailProps {
  /** 成员配置 */
  config: MemberConfig
  /** 运行时状态 */
  runtime?: MemberRuntime
  /** 全部事件流（组件内过滤当前成员） */
  allEvents: TeamEvent[]
  /** 关闭抽屉回调 */
  onClose: () => void
}

function MemberDetail({ config, runtime, allEvents, onClose }: MemberDetailProps) {
  // 过滤当前成员的事件
  const memberEvents = useMemo(
    () => allEvents.filter((e) => e.from === config.id),
    [allEvents, config.id]
  )

  const totalTokens = (runtime?.inputTokens || 0) + (runtime?.outputTokens || 0)
  // 计算耗时
  const duration = runtime?.enterTime && runtime?.exitTime
    ? ((runtime.exitTime - runtime.enterTime) / 1000).toFixed(1) + 's'
    : runtime?.enterTime
      ? '运行中...'
      : '-'

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* 标题栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-border)]">
        {/* 头像 */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ backgroundColor: config.bgColor, color: config.accent }}
        >
          {config.initials}
        </div>

        {/* 名称 + 角色 */}
        <div>
          <div className="text-sm font-medium text-[var(--color-text)] flex items-center gap-1.5">
            <span>{config.icon}</span>
            <span>{config.name}</span>
            <span className="text-[10px] text-[var(--color-text-muted)] font-normal">({config.role})</span>
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)]">{config.tooltip}</div>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded hover:bg-white/10 text-[var(--color-text-muted)]"
        >
          <X size={16} />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex gap-4 p-4 max-h-[200px]">
        {/* 左：统计数据 */}
        <div className="flex flex-col gap-2 shrink-0 w-[180px]">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">统计</div>
          <StatRow icon={<Wrench size={12} />} label="工具调用" value={runtime?.toolCount || 0} />
          <StatRow icon={<Zap size={12} />} label="Token 消耗" value={formatNum(totalTokens)} />
          <StatRow icon={<Package size={12} />} label="产出物" value={runtime?.artifacts || 0} />
          <StatRow icon={<Clock size={12} />} label="耗时" value={duration} />
          {runtime?.currentTool && (
            <div className="text-[11px] text-[var(--color-accent)] mt-1">
              ⚙ 正在执行: {runtime.currentTool}
            </div>
          )}
        </div>

        {/* 右：事件日志 */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
            活动记录 ({memberEvents.length})
          </div>
          <div className="overflow-y-auto max-h-[150px] space-y-0.5">
            {memberEvents.length === 0 ? (
              <div className="text-[11px] text-[var(--color-text-muted)] py-2">暂无活动</div>
            ) : (
              memberEvents.map((evt) => {
                const t = new Date(evt.timestamp)
                const ts = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`
                return (
                  <div key={evt.id} className="flex items-start gap-1.5 text-[11px]">
                    <span className="text-[var(--color-text-muted)] font-mono shrink-0">{ts}</span>
                    <span className="text-[var(--color-text)] break-all">{evt.text}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** 统计行 */
function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-[var(--color-text-muted)]">{icon}</span>
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="ml-auto text-[var(--color-text)] font-medium">{value}</span>
    </div>
  )
}

/** 数字格式化 */
function formatNum(n: number): string {
  if (n === 0) return '0'
  if (n < 1000) return String(n)
  return (n / 1000).toFixed(1) + 'k'
}

export default memo(MemberDetail)
