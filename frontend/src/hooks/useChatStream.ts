/**
 * SSE 聊天流 Hook
 *
 * 封装 fetch + ReadableStream 消费 SSE /chat 端点，
 * 将事件分发到各个状态更新回调。
 */

import { useCallback, useRef, useState } from 'react'
import { getChatSSEUrl, getApproveSSEUrl, fetchConversationHistory } from '../api'
import type { SSEEvent, ChatMessage, NodeStatus, PhaseInfo, ToolCallInfo, BrowserStepInfo, MemberRuntime, TeamEvent, GlobalAggregates } from '../types'
import { emptyMemberRuntime } from '../types'
import { getMember } from '../lib/members'

/** 解析 SSE 文本行，提取事件 */
function parseSSE(text: string): SSEEvent[] {
  const events: SSEEvent[] = []
  // 按空行分割事件块
  const blocks = text.split('\n\n')
  for (const block of blocks) {
    if (!block.trim()) continue
    let eventType = ''
    let dataStr = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7)
      } else if (line.startsWith('data: ')) {
        dataStr = line.slice(6)
      }
    }
    if (eventType && dataStr) {
      try {
        const data = JSON.parse(dataStr)
        events.push({ type: eventType, ...data } as SSEEvent)
      } catch {
        // 跳过无法解析的事件
      }
    }
  }
  return events
}

export interface ChatStreamState {
  /** 当前消息列表 */
  messages: ChatMessage[]
  /** 是否正在流式生成 */
  isStreaming: boolean
  /** 当前 thread_id */
  threadId: string | null
  /** 节点状态映射 */
  nodeStates: Record<string, NodeStatus>
  /** 当前阶段信息 */
  phaseInfo: PhaseInfo | null
  /** 已加载的技能名称集合 */
  loadedSkills: Set<string>
  /** 错误信息 */
  error: string | null
}

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [nodeStates, setNodeStates] = useState<Record<string, NodeStatus>>({})
  const [phaseInfo, setPhaseInfo] = useState<PhaseInfo | null>(null)
  const [loadedSkills, setLoadedSkills] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [approvalRequest, setApprovalRequest] = useState<Record<string, unknown> | null>(null)

  // ==================== 团队办公室状态 ====================
  /** 每个成员的实时运行状态 */
  const [memberStates, setMemberStates] = useState<Record<string, MemberRuntime>>({})
  /** 全员事件流（最多保留 100 条） */
  const [eventFeed, setEventFeed] = useState<TeamEvent[]>([])
  /** 全局聚合统计 */
  const [globalAggregates, setGlobalAggregates] = useState<GlobalAggregates>({
    totalTools: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    streamStartTime: 0,
    activeNodes: 0,
  })

  // 用 ref 追踪当前正在构建的 assistant 消息
  const currentAssistantRef = useRef<ChatMessage | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /** 向事件流推送一条事件（最多保留 100 条） */
  const pushEvent = useCallback((from: string, kind: TeamEvent['kind'], text: string) => {
    const evt: TeamEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from,
      kind,
      text,
      timestamp: Date.now(),
    }
    setEventFeed(prev => {
      const next = [...prev, evt]
      return next.length > 100 ? next.slice(-100) : next
    })
  }, [])

  /** 获取成员中文名（落到未知时显示节点 ID） */
  const memberName = useCallback((nodeId: string) => {
    return getMember(nodeId)?.name || nodeId
  }, [])

  /** 发送消息并消费 SSE 流 */
  const sendMessage = useCallback(async (
    query: string,
    existingThreadId?: string,
    options?: { forcePlanning?: boolean }
  ) => {
    // 中止之前的流
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsStreaming(true)
    setError(null)
    setApprovalRequest(null)

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])

    // 重置节点状态和技能
    setNodeStates({})
    setLoadedSkills(new Set())
    // 重置团队办公室状态
    setMemberStates({})
    setEventFeed([])
    setGlobalAggregates({
      totalTools: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      streamStartTime: Date.now(),
      activeNodes: 0,
    })

    // 准备 assistant 消息容器
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      reasoning: '',
      timestamp: Date.now(),
      toolCalls: [],
    }
    currentAssistantRef.current = assistantMsg
    setMessages(prev => [...prev, assistantMsg])

    try {
      const body: Record<string, string | boolean> = { query }
      if (existingThreadId || threadId) {
        body.thread_id = existingThreadId || threadId!
      }
      if (options?.forcePlanning) {
        // 强制开启规划模式：后端会预设 advisor_context，跳过 Agent 直入 Advisor
        body.force_planning = true
      }

      const res = await fetch(getChatSSEUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`请求失败: ${res.status}`)
      if (!res.body) throw new Error('响应体为空')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 处理缓冲区中的完整事件（以 \n\n 分隔）
        while (buffer.includes('\n\n')) {
          const idx = buffer.indexOf('\n\n')
          const chunk = buffer.slice(0, idx + 2)
          buffer = buffer.slice(idx + 2)

          const events = parseSSE(chunk)
          for (const evt of events) {
            handleSSEEvent(evt, assistantMsg)
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message)
      }
    } finally {
      setIsStreaming(false)
      currentAssistantRef.current = null
    }
  }, [threadId])

  /** 处理单个 SSE 事件（同时更新聊天状态 + 团队办公室状态） */
  const handleSSEEvent = useCallback((evt: SSEEvent, assistantMsg: ChatMessage) => {
    switch (evt.type) {
      case 'thread_id':
        setThreadId(evt.thread_id)
        break

      case 'token': {
        assistantMsg.content += evt.content
        // 强制触发 re-render
        setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }])
        // 更新成员最近思考内容
        const tokenNode = evt.node
        if (tokenNode) {
          setMemberStates(prev => {
            const cur = prev[tokenNode] || emptyMemberRuntime()
            const merged = (cur.latestThinking + evt.content).slice(-120)
            return { ...prev, [tokenNode]: { ...cur, latestThinking: merged } }
          })
        }
        break
      }

      case 'reasoning':
        assistantMsg.reasoning = (assistantMsg.reasoning || '') + evt.content
        setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }])
        break

      case 'tool_start': {
        const tc: ToolCallInfo = { name: evt.tool_name, status: 'running' }
        assistantMsg.toolCalls = [...(assistantMsg.toolCalls || []), tc]
        setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }])
        // 更新成员工具计数 + 当前工具
        const toolNode = evt.node
        if (toolNode) {
          setMemberStates(prev => {
            const cur = prev[toolNode] || emptyMemberRuntime()
            return { ...prev, [toolNode]: { ...cur, toolCount: cur.toolCount + 1, currentTool: evt.tool_name } }
          })
        }
        // 全局工具计数
        setGlobalAggregates(prev => ({ ...prev, totalTools: prev.totalTools + 1 }))
        // 事件流
        const argsPart = evt.args_summary ? ` · ${evt.args_summary.slice(0, 80)}` : ''
        pushEvent(toolNode || 'system', 'tool', `${memberName(toolNode || '')} → ${evt.tool_name}${argsPart}`)
        break
      }

      case 'tool_end': {
        const calls = assistantMsg.toolCalls || []
        const lastRunning = calls.findIndex(tc => tc.name === evt.tool_name && tc.status === 'running')
        if (lastRunning >= 0) {
          calls[lastRunning] = { ...calls[lastRunning], status: 'done', output: evt.output }
          assistantMsg.toolCalls = [...calls]
          setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }])
        }
        // 清除当前工具标记 + 产出物计数
        const endNode = evt.node
        if (endNode) {
          setMemberStates(prev => {
            const cur = prev[endNode] || emptyMemberRuntime()
            return { ...prev, [endNode]: { ...cur, currentTool: '', artifacts: cur.artifacts + 1 } }
          })
        }
        break
      }

      case 'node_enter':
        setNodeStates(prev => ({ ...prev, [evt.node]: 'active' }))
        // 更新成员状态
        setMemberStates(prev => {
          const cur = prev[evt.node] || emptyMemberRuntime()
          return { ...prev, [evt.node]: { ...cur, status: 'active', enterTime: Date.now() } }
        })
        // 全局活跃节点数
        setGlobalAggregates(prev => ({ ...prev, activeNodes: prev.activeNodes + 1 }))
        // 事件流
        pushEvent(evt.node, 'node', `${memberName(evt.node)} 开始工作`)
        break

      case 'node_exit':
        setNodeStates(prev => ({ ...prev, [evt.node]: 'completed' }))
        // 更新成员状态
        setMemberStates(prev => {
          const cur = prev[evt.node] || emptyMemberRuntime()
          return { ...prev, [evt.node]: { ...cur, status: 'completed', exitTime: Date.now(), currentTool: '' } }
        })
        // 全局活跃节点数
        setGlobalAggregates(prev => ({ ...prev, activeNodes: Math.max(0, prev.activeNodes - 1) }))
        // 事件流
        pushEvent(evt.node, 'node', `${memberName(evt.node)} 完成`)
        break

      case 'phase_update':
        setPhaseInfo({
          current_phase: evt.current_phase,
          total_phases: evt.total_phases,
          phase_name: evt.phase_name,
          phase_method: evt.phase_method,
          phase_status: evt.phase_status,
        })
        // 事件流
        pushEvent('system', 'phase', `阶段 ${evt.current_phase + 1}/${evt.total_phases} · ${evt.phase_name}（${evt.phase_method}）`)
        break

      case 'token_usage': {
        // 更新成员 token 用量
        const usageNode = evt.node
        if (usageNode) {
          setMemberStates(prev => {
            const cur = prev[usageNode] || emptyMemberRuntime()
            return {
              ...prev,
              [usageNode]: {
                ...cur,
                inputTokens: cur.inputTokens + evt.input_tokens,
                outputTokens: cur.outputTokens + evt.output_tokens,
              },
            }
          })
        }
        // 全局 token 用量
        setGlobalAggregates(prev => ({
          ...prev,
          totalInputTokens: prev.totalInputTokens + evt.input_tokens,
          totalOutputTokens: prev.totalOutputTokens + evt.output_tokens,
        }))
        // 事件流（仅在 token 数较大时推送，避免刷屏）
        const totalTokens = evt.input_tokens + evt.output_tokens
        if (totalTokens > 100) {
          pushEvent(usageNode || 'system', 'token_usage', `${memberName(usageNode || '')} 消耗 ${totalTokens.toLocaleString()} tokens`)
        }
        break
      }

      case 'browser_step': {
        // 将浏览器步骤追加到当前 assistant 消息的 browserSteps 数组
        const step: BrowserStepInfo = {
          stepNumber: evt.step_number,
          actions: evt.actions || [],
          evaluation: evt.evaluation || '',
          nextGoal: evt.next_goal || '',
          pageUrl: evt.page_url || '',
        }
        assistantMsg.browserSteps = [...(assistantMsg.browserSteps || []), step]
        setMessages(prev => [...prev.slice(0, -1), { ...assistantMsg }])
        break
      }

      case 'skill_loaded':
        setLoadedSkills(prev => new Set(prev).add(evt.skill_name))
        // 事件流
        pushEvent(evt.node || 'system', 'skill', `加载技能 ${evt.display_name || evt.skill_name}`)
        break

      case 'approval_request':
        setApprovalRequest(evt.data)
        break

      case 'error':
        setError(evt.message)
        pushEvent('system', 'error', evt.message)
        break

      case 'done':
        // 流结束
        pushEvent('system', 'done', '执行完成')
        break
    }
  }, [pushEvent, memberName])

  /** 审批后通过 SSE 流式恢复图执行 */
  const resumeAfterApproval = useCallback(async (action: string, feedback?: string) => {
    if (!threadId) return

    // 中止之前的流
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsStreaming(true)
    setError(null)
    setApprovalRequest(null)

    // 准备 assistant 消息容器（审批后的新回复）
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      reasoning: '',
      timestamp: Date.now(),
      toolCalls: [],
    }
    currentAssistantRef.current = assistantMsg
    setMessages(prev => [...prev, assistantMsg])

    try {
      const body: Record<string, string> = { thread_id: threadId, action }
      if (feedback) body.feedback = feedback

      const res = await fetch(getApproveSSEUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`审批请求失败: ${res.status}`)
      if (!res.body) throw new Error('响应体为空')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        while (buffer.includes('\n\n')) {
          const idx = buffer.indexOf('\n\n')
          const chunk = buffer.slice(0, idx + 2)
          buffer = buffer.slice(idx + 2)

          const events = parseSSE(chunk)
          for (const evt of events) {
            handleSSEEvent(evt, assistantMsg)
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message)
      }
    } finally {
      setIsStreaming(false)
      currentAssistantRef.current = null
    }
  }, [threadId])

  /** 中止当前流（同时重置流程图和阶段状态为初始样式） */
  const abort = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    // 重置流程图高亮和阶段信息，恢复初始未执行样式
    setNodeStates({})
    setPhaseInfo(null)
    setApprovalRequest(null)
  }, [])

  /** 清空对话，开始新会话 */
  const resetChat = useCallback(() => {
    abort()
    setMessages([])
    setThreadId(null)
    setNodeStates({})
    setPhaseInfo(null)
    setLoadedSkills(new Set())
    setError(null)
    setApprovalRequest(null)
    // 重置团队办公室状态
    setMemberStates({})
    setEventFeed([])
    setGlobalAggregates({ totalTools: 0, totalInputTokens: 0, totalOutputTokens: 0, streamStartTime: 0, activeNodes: 0 })
  }, [abort])

  /** 加载指定会话的历史消息 */
  const loadConversation = useCallback(async (targetThreadId: string) => {
    // 中止当前流，清空本地状态
    abortRef.current?.abort()
    setIsStreaming(false)
    setError(null)
    setApprovalRequest(null)
    setNodeStates({})
    setPhaseInfo(null)
    setLoadedSkills(new Set())
    // 重置团队办公室状态
    setMemberStates({})
    setEventFeed([])
    setGlobalAggregates({ totalTools: 0, totalInputTokens: 0, totalOutputTokens: 0, streamStartTime: 0, activeNodes: 0 })

    try {
      const history = await fetchConversationHistory(targetThreadId)
      // 将后端历史消息转换为前端 ChatMessage 格式
      const converted: ChatMessage[] = []
      let currentAi: ChatMessage | null = null
      for (const h of history) {
        if (h.role === 'user') {
          // user 消息：独立气泡
          converted.push({
            id: h.id || `user-${converted.length}`,
            role: 'user',
            content: h.content || '',
            timestamp: 0,
          })
          currentAi = null
        } else if (h.role === 'ai') {
          // AI 消息：独立气泡（工具调用展示为 tool_calls）
          currentAi = {
            id: h.id || `assistant-${converted.length}`,
            role: 'assistant',
            content: h.content || '',
            timestamp: 0,
            toolCalls: Array.isArray(h.tool_calls)
              ? h.tool_calls.map((tc: any) => ({
                  name: tc?.name || 'tool',
                  status: 'done' as const,
                }))
              : [],
          }
          converted.push(currentAi)
        } else if (h.role === 'tool') {
          // tool 消息：合并到上一条 AI 消息的 toolCalls 中
          if (currentAi) {
            currentAi.toolCalls = [
              ...(currentAi.toolCalls || []),
              {
                name: h.tool_name || 'tool',
                status: 'done' as const,
                output: h.content,
              },
            ]
          }
        }
      }
      setMessages(converted)
      setThreadId(targetThreadId)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  return {
    messages,
    isStreaming,
    threadId,
    nodeStates,
    phaseInfo,
    loadedSkills,
    error,
    approvalRequest,
    // 团队办公室状态
    memberStates,
    eventFeed,
    globalAggregates,
    sendMessage,
    resumeAfterApproval,
    abort,
    resetChat,
    loadConversation,
  }
}
