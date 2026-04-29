/**
 * 全员事件流组件
 *
 * 右侧实时滚动的事件 Timeline，显示所有节点的活动记录。
 * 自动滚动到最新事件，按事件类型着色。
 */

import { useEffect, useRef, memo } from 'react'
import { Activity } from 'lucide-react'
import type { TeamEvent } from '../types'
import { getMember } from '../lib/members'

interface EventStreamProps {
  /** 事件列表 */
  events: TeamEvent[]
}

/** 事件类型颜色映射 */
const KIND_COLORS: Record<TeamEvent['kind'], string> = {
  node: 'text-blue-400',
  tool: 'text-cyan-400',
  phase: 'text-green-400',
  token_usage: 'text-yellow-400',
  skill: 'text-purple-400',
  error: 'text-red-400',
  done: 'text-emerald-400',
}

/** 事件类型图标 */
const KIND_ICONS: Record<TeamEvent['kind'], string> = {
  node: '●',
  tool: '⚙',
  phase: '📋',
  token_usage: '⚡',
  skill: '📚',
  error: '❌',
  done: '✅',
}

function EventStream({ events }: EventStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  // 自动滚动到底部
  useEffect(() => {
    const el = containerRef.current
    if (el && shouldAutoScroll.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [events])

  // 检测用户是否手动向上滚动（暂停自动滚动）
  const handleScroll = () => {
    const el = containerRef.current
    if (el) {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      shouldAutoScroll.current = atBottom
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] shrink-0">
        <Activity size={14} className="text-[var(--color-accent)]" />
        <span className="text-xs font-medium text-[var(--color-text)]">事件流</span>
        <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">{events.length} 条</span>
      </div>

      {/* 事件列表 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5"
      >
        {events.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)] text-center py-8">
            等待执行...
          </div>
        ) : (
          events.map((evt) => (
            <EventItem key={evt.id} event={evt} />
          ))
        )}
      </div>
    </div>
  )
}

/** 单条事件 */
const EventItem = memo(function EventItem({ event }: { event: TeamEvent }) {
  const member = getMember(event.from)
  const time = new Date(event.timestamp)
  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`

  return (
    <div className="flex items-start gap-1.5 py-1 group hover:bg-white/[0.02] rounded px-1">
      {/* 时间 */}
      <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 w-12 font-mono pt-0.5">
        {timeStr}
      </span>

      {/* 成员头像（小圆点） */}
      {member ? (
        <span
          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5"
          style={{ backgroundColor: member.bgColor, color: member.accent }}
        >
          {member.initials}
        </span>
      ) : (
        <span className="w-4 h-4 rounded-full bg-gray-600 flex items-center justify-center text-[8px] shrink-0 mt-0.5">
          S
        </span>
      )}

      {/* 事件图标 + 文本 */}
      <div className="min-w-0 flex-1">
        <span className={`text-[10px] mr-1 ${KIND_COLORS[event.kind]}`}>
          {KIND_ICONS[event.kind]}
        </span>
        <span className="text-[11px] text-[var(--color-text)] break-all leading-tight">
          {event.text}
        </span>
      </div>
    </div>
  )
})

export default memo(EventStream)
