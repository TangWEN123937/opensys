/**
 * 聊天消息面板
 *
 * 左侧主区域：展示用户/AI 对话气泡、流式 token、工具调用、审批请求。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Square, Plus, Wrench, Brain, CheckCircle, Loader2, History, Trash2, Sparkles, ChevronDown, ChevronRight, Globe, ArrowDown } from 'lucide-react'
import type { ChatMessage, BrowserStepInfo } from '../types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchConversations, deleteConversation, type ConversationInfo } from '../api'

interface ChatPanelProps {
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
  approvalRequest: Record<string, unknown> | null
  threadId: string | null
  onSend: (query: string, options?: { forcePlanning?: boolean }) => void
  onAbort: () => void
  onReset: () => void
  onApprove: (action: string, feedback?: string) => void
  onLoadConversation: (threadId: string) => void
}

export default function ChatPanel({
  messages,
  isStreaming,
  error,
  approvalRequest,
  threadId,
  onSend,
  onAbort,
  onReset,
  onApprove,
  onLoadConversation,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [forcePlanning, setForcePlanning] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [conversations, setConversations] = useState<ConversationInfo[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // 是否在底部附近（用于判断是否自动跟随滚动）
  const isNearBottomRef = useRef(true)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  /** 判断滚动容器是否在底部附近（阈值 80px） */
  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  /** 监听滚动事件，更新"是否在底部"状态 */
  const handleScroll = useCallback(() => {
    const near = checkNearBottom()
    isNearBottomRef.current = near
    setShowScrollBtn(!near)
  }, [checkNearBottom])

  /** 平滑滚动到底部 */
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  // 自动滚动：仅当用户已在底部附近时才跟随新消息/流式内容
  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // 打开历史面板时拉取会话列表
  const refreshConversations = async () => {
    setLoadingHistory(true)
    try {
      const list = await fetchConversations()
      setConversations(list)
    } catch (err) {
      console.error('加载会话列表失败:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const toggleHistory = () => {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next) refreshConversations()
  }

  const handleLoadConversation = (tid: string) => {
    onLoadConversation(tid)
    setHistoryOpen(false)
  }

  const handleDeleteConversation = async (tid: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定删除该会话吗？')) return
    try {
      await deleteConversation(tid)
      // 如果删除的是当前会话，重置
      if (tid === threadId) onReset()
      refreshConversations()
    } catch (err) {
      alert(`删除失败: ${(err as Error).message}`)
    }
  }

  // 发送消息
  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    onSend(text, { forcePlanning })
    setInput('')
    // 重置输入框高度
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }

  // 快捷键：Enter 发送，Shift+Enter 换行
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 自动调整输入框高度
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      {/* 顶部栏 */}
      <div className="relative flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">💬 对话</h2>
          {threadId && (
            <span className="text-xs text-[var(--color-text-muted)] font-mono" title={threadId}>
              #{threadId.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleHistory}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] transition-colors"
            title="历史会话"
          >
            <History size={14} />
            历史
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] transition-colors"
            title="新建对话"
          >
            <Plus size={14} />
            新对话
          </button>
        </div>

        {/* 历史会话下拉面板 */}
        {historyOpen && (
          <div className="absolute right-4 top-full mt-1 z-20 w-80 max-h-96 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
            <div className="px-3 py-2 border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex items-center justify-between">
              <span>历史会话（{conversations.length}）</span>
              <button
                onClick={refreshConversations}
                className="text-[var(--color-accent)] hover:underline"
              >
                刷新
              </button>
            </div>
            {loadingHistory && (
              <div className="px-3 py-4 text-xs text-[var(--color-text-muted)] text-center">
                加载中...
              </div>
            )}
            {!loadingHistory && conversations.length === 0 && (
              <div className="px-3 py-4 text-xs text-[var(--color-text-muted)] text-center">
                暂无历史会话
              </div>
            )}
            {!loadingHistory && conversations.map(conv => (
              <div
                key={conv.thread_id}
                onClick={() => handleLoadConversation(conv.thread_id)}
                className={`group flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--color-bg)] border-b border-[var(--color-border)]/50 ${
                  conv.thread_id === threadId ? 'bg-[var(--color-bg)]' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--color-text)] truncate">
                    {conv.title || '(无标题)'}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-2 mt-0.5">
                    <span className="font-mono">#{conv.thread_id.slice(0, 8)}</span>
                    {conv.message_count !== undefined && <span>· {conv.message_count} 条</span>}
                    <span>· {conv.updated_at?.slice(0, 16)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(conv.thread_id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-400 transition-all"
                  title="删除会话"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)] text-sm">
            发送消息开始对话 👋
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* 流式加载指示器 */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-accent)]">
            <Loader2 size={14} className="animate-spin" />
            AI 正在思考...
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* 审批请求 */}
        {approvalRequest && (
          <ApprovalCard data={approvalRequest} onApprove={onApprove} />
        )}
      </div>

      {/* 回到底部浮动按钮：用户向上滚动查看历史时显示 */}
      {showScrollBtn && (
        <div className="relative">
          <button
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10
              flex items-center gap-1 px-3 py-1.5 text-xs rounded-full
              bg-[var(--color-surface)] border border-[var(--color-border)]
              text-[var(--color-text-secondary)] shadow-lg
              hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-all"
          >
            <ArrowDown size={12} />
            回到最新
          </button>
        </div>
      )}

      {/* 输入区 */}
      <div className="px-4 py-3 border-t border-[var(--color-border)]">
        {/* 规划模式开关 */}
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setForcePlanning(!forcePlanning)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full transition-all border ${
              forcePlanning
                ? 'bg-[var(--color-accent)]/20 border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'bg-transparent border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/50'
            }`}
            title="开启后，消息将跳过 Agent 直接进入 Advisor 规划流程（等效 /plan）"
          >
            <Sparkles size={12} />
            <span>规划模式</span>
            {/* 滑轨：相对定位容器，固定宽高 */}
            <span
              className={`relative inline-block w-7 h-3.5 rounded-full transition-colors ${
                forcePlanning ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
              }`}
              aria-hidden="true"
            >
              {/* 滑块：绝对定位在滑轨内 */}
              <span
                className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${
                  forcePlanning ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
          {forcePlanning && (
            <span className="text-xs text-[var(--color-text-muted)]">
              将进入多阶段规划流程
            </span>
          )}
        </div>
        <div className="flex items-end gap-2 bg-[var(--color-surface)] rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] resize-none outline-none max-h-[150px]"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={onAbort}
              className="p-1.5 rounded-lg bg-[var(--color-error)] text-white hover:opacity-80 transition-opacity"
              title="停止生成"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-1.5 rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-30 transition-all"
              title="发送 (Enter)"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== 消息气泡 ====================

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] min-w-0 rounded-xl px-3 py-2 text-sm leading-relaxed overflow-hidden break-words ${
          isUser
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-[var(--color-surface)] text-[var(--color-text)]'
        }`}
      >
        {/* 深度思考（可折叠） */}
        {message.reasoning && (
          <ReasoningBlock content={message.reasoning} />
        )}

        {/* 工具调用列表 */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1 mb-2">
            {message.toolCalls.map((tc, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                {tc.status === 'running' ? (
                  <Loader2 size={12} className="animate-spin text-[var(--color-warning)]" />
                ) : (
                  <CheckCircle size={12} className="text-[var(--color-success)]" />
                )}
                <Wrench size={12} />
                <span className="font-mono">{tc.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* 浏览器操作步骤卡片 */}
        {message.browserSteps && message.browserSteps.length > 0 && (
          <BrowserStepsCard steps={message.browserSteps} />
        )}

        {/* 消息正文（Markdown 渲染） */}
        {/* 注意：用 overflow-wrap/word-break 防止长 URL 撑破气泡；
             table/pre 在内容过宽时单独横向滚动，而不是把整个气泡撑宽。 */}
        {message.content && (
          <div
            className="prose prose-invert prose-sm max-w-none min-w-0
              [&_p]:m-0 [&_p]:break-words
              [&_a]:break-all
              [&_code]:text-[var(--color-accent)] [&_code]:break-words
              [&_pre]:bg-black/30 [&_pre]:rounded [&_pre]:p-2 [&_pre]:overflow-x-auto [&_pre]:max-w-full
              [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full
              [&_img]:max-w-full"
            style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== 深度思考折叠块 ====================

function ReasoningBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
      >
        <Brain size={12} />
        {open ? '收起' : '展开'}深度思考
      </button>
      {open && (
        <div className="mt-1 pl-4 border-l-2 border-[var(--color-accent)]/30 text-xs text-[var(--color-text-muted)] whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  )
}

// ==================== 审批卡片 ====================

function ApprovalCard({
  data,
  onApprove,
}: {
  data: Record<string, unknown>
  onApprove: (action: string, feedback?: string) => void
}) {
  const [feedback, setFeedback] = useState('')
  const interruptType = (data as Record<string, unknown>)?.type as string | undefined

  // === ask_user 类型：显示问题 + 用户回复输入框 ===
  if (interruptType === 'ask_user') {
    const question = (data as Record<string, unknown>)?.question as string || ''
    return (
      <div className="rounded-xl border border-blue-500/50 bg-blue-500/10 p-3 space-y-2">
        <div className="text-sm font-medium text-blue-400">💬 AI 需要你的回复</div>
        <div className="text-sm text-[var(--color-text)] whitespace-pre-wrap leading-relaxed">
          {question}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="输入你的回复..."
            rows={2}
            className="flex-1 text-sm bg-black/20 rounded-lg px-3 py-2 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && feedback.trim()) {
                e.preventDefault()
                onApprove('user_reply', feedback)
              }
            }}
          />
          <button
            onClick={() => onApprove('user_reply', feedback)}
            disabled={!feedback.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-30 transition-colors shrink-0"
          >
            发送
          </button>
        </div>
      </div>
    )
  }

  // === pipeline_confirmation 类型：Pipeline 执行确认 ===
  if (interruptType === 'pipeline_confirmation') {
    return (
      <div className="rounded-xl border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 p-3 space-y-2">
        <div className="text-sm font-medium text-[var(--color-warning)]">📋 Pipeline 执行确认</div>
        <pre className="text-xs text-[var(--color-text-muted)] bg-black/20 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
        <div className="flex items-center gap-2">
          <input
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="修改意见（可选）"
            className="flex-1 text-xs bg-black/20 rounded px-2 py-1 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onApprove('approved')}
            className="px-3 py-1 text-xs rounded bg-[var(--color-success)] text-white hover:opacity-80"
          >
            ✅ 确认执行
          </button>
          <button
            onClick={() => onApprove('modified', feedback)}
            disabled={!feedback.trim()}
            className="px-3 py-1 text-xs rounded bg-[var(--color-primary)] text-white hover:opacity-80 disabled:opacity-30"
          >
            ✏️ 修改
          </button>
          <button
            onClick={() => onApprove('rejected')}
            className="px-3 py-1 text-xs rounded bg-[var(--color-error)] text-white hover:opacity-80"
          >
            ❌ 取消
          </button>
        </div>
      </div>
    )
  }

  // === approval_request / 其他类型：工具审批卡片 ===
  return (
    <div className="rounded-xl border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 p-3 space-y-2">
      <div className="text-sm font-medium text-[var(--color-warning)]">⏳ 等待审批</div>
      {/* 显示风险等级和命令描述 */}
      <pre className="text-xs text-[var(--color-text-muted)] bg-black/20 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
      <div className="flex items-center gap-2">
        <input
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          placeholder="修改意见（可选）"
          className="flex-1 text-xs bg-black/20 rounded px-2 py-1 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onApprove('approved')}
          className="px-3 py-1 text-xs rounded bg-[var(--color-success)] text-white hover:opacity-80"
        >
          ✅ 批准
        </button>
        <button
          onClick={() => onApprove('modified', feedback)}
          disabled={!feedback.trim()}
          className="px-3 py-1 text-xs rounded bg-[var(--color-primary)] text-white hover:opacity-80 disabled:opacity-30"
        >
          ✏️ 修改
        </button>
        <button
          onClick={() => onApprove('rejected')}
          className="px-3 py-1 text-xs rounded bg-[var(--color-error)] text-white hover:opacity-80"
        >
          ❌ 拒绝
        </button>
      </div>
    </div>
  )
}

// ==================== 浏览器步骤卡片 ====================

/** 获取 action 的显示 emoji */
function getActionEmoji(name: string): string {
  const map: Record<string, string> = {
    click_element: '🖱️',
    input_text: '⌨️',
    go_to_url: '🔗',
    scroll_down: '⬇️',
    scroll_up: '⬆️',
    wait: '⏳',
    done: '✅',
    extract_content: '📋',
    screenshot: '📸',
    upload_file: '📤',
    ask_user_for_browser: '💬',
    read_local_file: '📄',
    convert_to_docx: '📝',
  }
  return map[name] || '⚙️'
}

/** 格式化 action 参数为简短描述 */
function formatActionParams(name: string, params: Record<string, unknown>): string {
  if (name === 'go_to_url' && params.url) return String(params.url)
  if (name === 'click_element' && params.index != null) return `元素 #${params.index}`
  if (name === 'input_text' && params.text) {
    const text = String(params.text)
    return text.length > 40 ? text.slice(0, 40) + '...' : text
  }
  if (name === 'done' && params.text) {
    const text = String(params.text)
    return text.length > 60 ? text.slice(0, 60) + '...' : text
  }
  // 通用：取第一个有值的参数
  for (const [, v] of Object.entries(params)) {
    if (v != null && v !== '') {
      const s = String(v)
      return s.length > 50 ? s.slice(0, 50) + '...' : s
    }
  }
  return ''
}

function BrowserStepsCard({ steps }: { steps: BrowserStepInfo[] }) {
  const [expanded, setExpanded] = useState(true)
  const lastStep = steps[steps.length - 1]
  const isRunning = lastStep && !lastStep.actions.some(a => a.name === 'done')

  return (
    <div className="mb-2 rounded-lg border border-[var(--color-border)] bg-black/20 overflow-hidden">
      {/* 标题栏 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-white/5 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Globe size={14} className="text-[var(--color-accent)]" />
        <span>浏览器操作</span>
        <span className="ml-auto text-[var(--color-text-muted)]">
          {steps.length} 步{isRunning ? ' · 执行中...' : ' · 完成'}
        </span>
        {isRunning && <Loader2 size={12} className="animate-spin text-[var(--color-warning)]" />}
      </button>

      {/* 步骤列表 */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1 max-h-64 overflow-y-auto">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs">
              {/* 步骤编号 */}
              <span className="shrink-0 w-5 text-right text-[var(--color-text-muted)] font-mono">
                {step.stepNumber}
              </span>

              {/* actions */}
              <div className="flex-1 min-w-0">
                {step.actions.length > 0 ? (
                  step.actions.map((action, ai) => (
                    <div key={ai} className="flex items-center gap-1 text-[var(--color-text-secondary)]">
                      <span>{getActionEmoji(action.name)}</span>
                      <span className="font-mono text-[var(--color-accent)]">{action.name}</span>
                      {formatActionParams(action.name, action.params) && (
                        <span className="text-[var(--color-text-muted)] truncate">
                          {formatActionParams(action.name, action.params)}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <span className="text-[var(--color-text-muted)] italic">思考中...</span>
                )}

                {/* next goal（只显示最后一步） */}
                {idx === steps.length - 1 && step.nextGoal && (
                  <div className="mt-0.5 text-[var(--color-text-muted)] italic truncate">
                    🎯 {step.nextGoal}
                  </div>
                )}
              </div>

              {/* 评价状态 */}
              <span className="shrink-0">
                {step.evaluation.toLowerCase().includes('success') ? '✅' :
                 step.evaluation.toLowerCase().includes('fail') ? '⚠️' :
                 idx === steps.length - 1 && isRunning ? '⏳' : '·'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
