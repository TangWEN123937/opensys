/**
 * 浏览器实时画面查看器
 *
 * 当 Browser 节点正在执行时，自动弹出嵌入式 noVNC 窗口，
 * 让用户实时看到 AI 操控浏览器的画面。
 * 支持拖拽移动、最小化、全屏切换、手动关闭。
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Monitor, Minimize2, Maximize2, X } from 'lucide-react'

interface BrowserViewerProps {
  /** 是否显示（browser 节点 active 时为 true） */
  visible: boolean
  /** 手动关闭回调 */
  onClose: () => void
}

export default function BrowserViewer({ visible, onClose }: BrowserViewerProps) {
  // 最小化 / 全屏状态
  const [minimized, setMinimized] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  // ---- 拖拽相关 state ----
  // 窗口位置（null 表示使用默认的右下角定位）
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  // 是否正在拖拽中（用于在 iframe 上叠遮罩，防止 iframe 吞掉鼠标事件）
  const [dragging, setDragging] = useState(false)
  // 拖拽起始偏移量
  const dragOffset = useRef({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // noVNC URL（通过 nginx/vite 代理 /novnc → agent:6080）
  // 关键点：vnc_lite.html 默认 WebSocket path=websockify（即 ws://host/websockify）
  // 但我们的反向代理只暴露了 /novnc/websockify 路径，所以必须显式指定 path 参数，
  // 否则客户端会连到 /websockify 无法匹配，永远卡在 "Connecting"。
  const novncUrl = '/novnc/vnc_lite.html?autoconnect=true&resize=scale&reconnect=true&reconnect_delay=3000&path=novnc/websockify'

  // 切换最小化
  const toggleMinimize = useCallback(() => {
    setMinimized(prev => !prev)
    if (fullscreen) setFullscreen(false)
  }, [fullscreen])

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    setFullscreen(prev => !prev)
    if (minimized) setMinimized(false)
  }, [minimized])

  // ---- 拖拽：鼠标按下标题栏开始 ----
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // 全屏模式不允许拖拽
    if (fullscreen) return
    // 如果点击的是按钮，不启动拖拽
    if ((e.target as HTMLElement).closest('button')) return

    e.preventDefault()
    setDragging(true)

    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
  }, [fullscreen])

  // ---- 拖拽：document 级 mousemove / mouseup ----
  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      // 计算新位置，限制不超出视口
      const x = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - 200))
      const y = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - 40))
      setPosition({ x, y })
    }

    const handleMouseUp = () => {
      setDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging])

  if (!visible) return null

  // 最小化：只显示标题栏，悬浮在右下角
  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
           onClick={toggleMinimize}>
        <Monitor size={14} className="text-green-400 animate-pulse" />
        <span className="text-xs font-medium text-[var(--color-text)]">浏览器运行中...</span>
        <Maximize2 size={12} className="text-[var(--color-text-muted)]" />
      </div>
    )
  }

  // 全屏：覆盖整个视口；正常：可拖拽悬浮窗口
  const containerStyle: React.CSSProperties = fullscreen
    ? {}
    : position
      ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
      : {}

  const containerClass = fullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-black'
    : `fixed z-40 flex flex-col w-[720px] h-[480px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden ${
        position ? '' : 'bottom-4 right-4'
      }`

  return (
    <div ref={containerRef} className={containerClass} style={containerStyle}>
      {/* 标题栏（拖拽手柄） */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--color-border)] shrink-0 select-none ${
          fullscreen ? '' : 'cursor-move'
        }`}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <Monitor size={14} className="text-green-400 animate-pulse" />
          <span className="text-xs font-medium text-[var(--color-text)]">
            浏览器实时画面
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
            运行中
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* 最小化 */}
          <button
            onClick={toggleMinimize}
            className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] transition-colors"
            title="最小化"
          >
            <Minimize2 size={14} />
          </button>
          {/* 全屏 / 还原 */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] transition-colors"
            title={fullscreen ? '还原窗口' : '全屏'}
          >
            <Maximize2 size={14} />
          </button>
          {/* 关闭 */}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* noVNC iframe + 拖拽遮罩 */}
      <div className="flex-1 bg-black relative">
        <iframe
          src={novncUrl}
          className="w-full h-full border-0"
          title="noVNC Browser View"
          allow="clipboard-read; clipboard-write"
        />
        {/* 拖拽时在 iframe 上覆盖透明遮罩，防止 iframe 吞掉鼠标事件 */}
        {dragging && <div className="absolute inset-0" />}
      </div>
    </div>
  )
}
