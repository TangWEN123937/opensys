/**
 * OpenSys 可视化调试前端 - 主页面
 *
 * 三区布局：
 * - 左侧：聊天消息区
 * - 右上：执行流程图
 * - 右下：技能标签区
 * - 浮层：浏览器实时画面（browser 节点执行时自动弹出）
 */

import { useState, useEffect } from 'react'
import { useChatStream } from './hooks/useChatStream'
import ChatPanel from './components/ChatPanel'
import FlowGraph from './components/FlowGraph'
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
  // isStreaming 从 true → false 且 browser 节点也不 active，说明整轮执行结束
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
      {/* 左侧：聊天面板（占 50% 宽度） */}
      <div className="w-1/2 min-w-[400px] border-r border-[var(--color-border)]">
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

      {/* 右侧：上下分栏 */}
      <div className="flex-1 flex flex-col min-w-[400px]">
        {/* 右上：流程图（占 60% 高度） */}
        <div className="h-[60%] border-b border-[var(--color-border)]">
          <FlowGraph nodeStates={nodeStates} phaseInfo={phaseInfo} />
        </div>

        {/* 右下：技能面板（占 40% 高度） */}
        <div className="h-[40%]">
          <SkillPanel loadedSkills={loadedSkills} />
        </div>
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
