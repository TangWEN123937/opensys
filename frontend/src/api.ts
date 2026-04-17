/**
 * OpenSys API 客户端
 *
 * 所有请求走 /api 前缀，由 Vite 代理到后端 8010 端口。
 */

import type { GraphTopology, SkillInfo } from './types'

// 后端 API 基础地址（通过 Vite 代理）
const BASE = '/api'

// ==================== 系统配置文件 ====================

/** 系统配置文件元数据 */
export interface SystemConfigInfo {
  key: string
  filename: string
  label: string
  description: string
  exists: boolean
  char_count: number
}

/** 获取所有系统配置文件列表 */
export async function fetchSystemConfigs(): Promise<SystemConfigInfo[]> {
  const res = await fetch(`${BASE}/system-configs`)
  if (!res.ok) throw new Error(`获取系统配置列表失败: ${res.status}`)
  const data = await res.json()
  return data.configs
}

/** 获取指定系统配置文件内容 */
export async function fetchSystemConfigContent(key: string): Promise<string> {
  const res = await fetch(`${BASE}/system-configs/${encodeURIComponent(key)}`)
  if (!res.ok) throw new Error(`获取配置内容失败: ${res.status}`)
  const data = await res.json()
  return data.content
}

/** 保存系统配置文件内容 */
export async function saveSystemConfigContent(key: string, content: string): Promise<void> {
  const res = await fetch(`${BASE}/system-configs/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`保存配置失败: ${res.status}`)
}

// ==================== 技能管理 ====================

/** 获取所有技能列表 */
export async function fetchSkills(): Promise<SkillInfo[]> {
  const res = await fetch(`${BASE}/skills`)
  if (!res.ok) throw new Error(`获取技能列表失败: ${res.status}`)
  const data = await res.json()
  return data.skills
}

/** 获取指定技能的文件内容 */
export async function fetchSkillContent(name: string): Promise<string> {
  const res = await fetch(`${BASE}/skills/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`获取技能内容失败: ${res.status}`)
  const data = await res.json()
  return data.content
}

/** 保存技能文件内容 */
export async function saveSkillContent(name: string, content: string): Promise<void> {
  const res = await fetch(`${BASE}/skills/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`保存技能失败: ${res.status}`)
}

/** 新建技能 */
export async function createSkill(dirName: string, category: string = '', content: string = ''): Promise<void> {
  const res = await fetch(`${BASE}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir_name: dirName, category, content }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(data.detail || `创建技能失败: ${res.status}`)
  }
}

/** 删除技能 */
export async function deleteSkill(name: string): Promise<void> {
  const res = await fetch(`${BASE}/skills/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`删除技能失败: ${res.status}`)
}

// ==================== 流程图拓扑 ====================

/** 获取 LangGraph 流程图拓扑结构 */
export async function fetchTopology(): Promise<GraphTopology> {
  const res = await fetch(`${BASE}/graph/topology`)
  if (!res.ok) throw new Error(`获取拓扑失败: ${res.status}`)
  return res.json()
}

// ==================== 对话管理 ====================

/** 对话列表项 */
export interface ConversationInfo {
  thread_id: string
  title: string
  status?: string
  message_count?: number
  created_at?: string
  updated_at: string
}

/** 历史消息条目 */
export interface HistoryMessage {
  id: string
  role: 'user' | 'ai' | 'tool'
  content: string
  tool_name?: string
  tool_calls?: unknown[]
}

/** 获取对话列表 */
export async function fetchConversations(): Promise<ConversationInfo[]> {
  const res = await fetch(`${BASE}/conversations`)
  if (!res.ok) throw new Error(`获取对话列表失败: ${res.status}`)
  const data = await res.json()
  return data.conversations
}

/** 获取指定对话的历史消息 */
export async function fetchConversationHistory(threadId: string): Promise<HistoryMessage[]> {
  const res = await fetch(`${BASE}/conversations/${encodeURIComponent(threadId)}/history`)
  if (!res.ok) throw new Error(`获取对话历史失败: ${res.status}`)
  const data = await res.json()
  return data.messages || []
}

/** 删除对话 */
export async function deleteConversation(threadId: string): Promise<void> {
  const res = await fetch(`${BASE}/conversations/${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`删除对话失败: ${res.status}`)
}

/** 发送聊天消息（返回 SSE 流 URL） */
export function getChatSSEUrl(): string {
  return `${BASE}/chat`
}

/** 获取审批 SSE 端点 URL（与 /chat 格式一致） */
export function getApproveSSEUrl(): string {
  return `${BASE}/chat/approve`
}

/** 发送审批操作（兜底用，推荐使用 SSE 流式审批） */
export async function sendApproval(threadId: string, action: string, feedback?: string): Promise<void> {
  const body: Record<string, string> = { thread_id: threadId, action }
  if (feedback) body.feedback = feedback
  const res = await fetch(`${BASE}/chat/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`审批操作失败: ${res.status}`)
}
