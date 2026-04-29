/**
 * OpenSys AI 团队办公室 - 主页面
 *
 * 三栏布局：
 * - 左侧（35%）：聊天面板
 * - 中间（45%）：团队办公室（卡片墙 / 流程图双视图）+ 全局统计栏 + 技能面板
 * - 右侧（20%）：全员事件流 Timeline
 * - 浮层：浏览器实时画面（browser 节点执行时自动弹出）
 */

import { useState, useEffect } from 'react'
import { useChatStream } from './hooks/useChatStream'
import ChatPanel from './components/ChatPanel'
import TeamOffice from './components/TeamOffice'
import GlobalStats from './components/GlobalStats'
import EventStream from './components/EventStream'
import SkillPanel from './components/SkillPanel'
import BrowserViewer from './components/BrowserViewer'

function App() {
  const {
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
  } = useChatStream()

  // 浏览器画面显示控制
  const [browserVisible, setBrowserVisible] = useState(false)
  // 用户手动关闭后不再自动弹出（直到下次 browser 节点重新 active）
  const [browserDismissed, setBrowserDismissed] = useState(false)

  // 监听 browser 节点状态变化，自动弹出/关闭浏览器画面
  const browserActive = nodeStates['browser'] === 'active'
  useEffect(() => {
    if (browserActive) {
      // browser 节点激活 → 自动弹出（除非用户手动关闭过）
      if (!browserDismissed) {
        setBrowserVisible(true)
      }
    } else {
      // browser 节点不再 active → 重置手动关闭标记（下次 active 时可再弹出）
      setBrowserDismissed(false)
    }
  }, [browserActive, browserDismissed])

  // 对话结束时自动关闭浏览器弹窗（避免残留空画面）
  useEffect(() => {
    if (!isStreaming && !browserActive) {
      setBrowserVisible(false)
    }
  }, [isStreaming, browserActive])

  /** 用户手动关闭浏览器画面 */
  const handleBrowserClose = () => {
    setBrowserVisible(false)
    setBrowserDismissed(true)
  }

  /** 处理审批操作（通过 SSE 流式恢复图执行） */
  const handleApprove = (action: string, feedback?: string) => {
    resumeAfterApproval(action, feedback)
  }

  /** 发送消息（适配 ChatPanel 的 (query, options) 签名到 hook 的 (query, threadId, options) 签名） */
  const handleSend = (query: string, options?: { forcePlanning?: boolean }) => {
    sendMessage(query, undefined, options)
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* 左栏：聊天面板（35%） */}
      <div className="w-[35%] min-w-[360px] border-r border-[var(--color-border)]">
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          error={error}
          approvalRequest={approvalRequest}
          threadId={threadId}
          onSend={handleSend}
          onAbort={abort}
          onReset={resetChat}
          onApprove={handleApprove}
          onLoadConversation={loadConversation}
        />
      </div>

      {/* 中栏：团队办公室（45%） */}
      <div className="flex-1 flex flex-col min-w-[400px] border-r border-[var(--color-border)]">
        {/* 全局统计栏 */}
        <GlobalStats
          aggregates={globalAggregates}
          phaseInfo={phaseInfo}
          isStreaming={isStreaming}
        />

        {/* 办公室主视图（卡片墙 / 流程图）占 65% 高度 */}
        <div className="h-[65%] border-b border-[var(--color-border)]">
          <TeamOffice
            memberStates={memberStates}
            nodeStates={nodeStates}
            phaseInfo={phaseInfo}
            eventFeed={eventFeed}
          />
        </div>

        {/* 技能面板（占 35% 高度） */}
        <div className="flex-1">
          <SkillPanel loadedSkills={loadedSkills} />
        </div>
      </div>

      {/* 右栏：全员事件流（20%） */}
      <div className="w-[20%] min-w-[220px]">
        <EventStream events={eventFeed} />
      </div>

      {/* 浮层：浏览器实时画面（browser 节点执行时自动弹出） */}
      <BrowserViewer
        visible={browserVisible}
        onClose={handleBrowserClose}
      />
    </div>
  )
}

export default App
