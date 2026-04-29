/**
 * 工作流悬浮面板（挂载到 FlowGraph 顶部栏右上角）
 *
 * 功能：
 * - 列出 data/workflows/ 下所有 Advisor 用的工作流模板（general/content-creation/...）
 * - 点击触发按钮 → 下拉列表
 * - 点击某项 → 打开 Monaco 编辑器查看/编辑/保存
 * - 支持新建（点击 +）和删除（悬浮在列表项右上的 × 按钮）
 *
 * 位置说明：
 * - 按钮本身不使用 fixed，由父容器（FlowGraph header）以 relative 布局定位
 * - 下拉列表用 absolute 相对按钮浮出
 * - 编辑器 Monaco 弹窗用 fixed 全屏覆盖（z-50）
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { Workflow, X, Save, Loader2, FileText, ChevronDown, Plus, Trash2, Copy, Check, Tag } from 'lucide-react'
import Editor from '@monaco-editor/react'
import {
  fetchWorkflows, fetchWorkflowContent, saveWorkflowContent,
  createWorkflow, deleteWorkflow,
  fetchSkills,
  type WorkflowInfo,
} from '../api'
import type { SkillInfo } from '../types'

export default function WorkflowPanel() {
  // 下拉列表展开/收起
  const [open, setOpen] = useState(false)
  // 工作流模板列表
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([])
  const [loading, setLoading] = useState(true)
  // 编辑器状态
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  // 新建工作流弹窗
  const [showCreate, setShowCreate] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  // 删除确认弹窗
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  // 技能速查（编辑工作流时供用户查阅中文名→英文 dir_name 的对照）
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [copiedDir, setCopiedDir] = useState<string | null>(null)  // 刚复制的 dir_name（用于显示 ✓）
  const [skillFilter, setSkillFilter] = useState('')              // 搜索框
  // 用于点击外部关闭下拉
  const rootRef = useRef<HTMLDivElement>(null)

  // 加载工作流列表
  const loadWorkflows = useCallback(async () => {
    try {
      const data = await fetchWorkflows()
      setWorkflows(data)
    } catch (err) {
      console.error('加载工作流列表失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadWorkflows() }, [loadWorkflows])

  // 点击外部关闭下拉
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // 懒加载技能列表（仅在首次打开编辑器时拉一次）
  const ensureSkillsLoaded = useCallback(async () => {
    if (skills.length > 0) return
    try {
      const data = await fetchSkills()
      setSkills(data)
    } catch (err) {
      console.error('加载技能列表失败:', err)
    }
  }, [skills.length])

  // 点击工作流项 → 打开编辑器（并行加载技能速查表）
  const handleOpen = useCallback(async (wf: WorkflowInfo) => {
    try {
      const [content] = await Promise.all([
        fetchWorkflowContent(wf.file_name),
        ensureSkillsLoaded(),
      ])
      setEditorContent(content)
      setEditingKey(wf.file_name)
      setEditingTitle(`data/workflows/${wf.file_name}.md`)
      setSaveMsg('')
      setOpen(false)
    } catch (err) {
      console.error('加载工作流内容失败:', err)
    }
  }, [ensureSkillsLoaded])

  // 复制 dir_name 到剪贴板
  const handleCopyDirName = useCallback(async (dirName: string) => {
    try {
      await navigator.clipboard.writeText(dirName)
      setCopiedDir(dirName)
      setTimeout(() => setCopiedDir(null), 1500)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }, [])

  // 保存
  const handleSave = useCallback(async () => {
    if (!editingKey) return
    setSaving(true)
    setSaveMsg('')
    try {
      await saveWorkflowContent(editingKey, editorContent)
      await loadWorkflows()
      setSaveMsg('✅ 已保存')
    } catch (err) {
      setSaveMsg(`❌ 保存失败: ${(err as Error).message}`)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }, [editingKey, editorContent, loadWorkflows])

  // 新建工作流
  const handleCreate = useCallback(async () => {
    if (!newFileName.trim()) { setCreateError('请输入文件名'); return }
    setCreating(true)
    setCreateError('')
    try {
      await createWorkflow({
        fileName: newFileName.trim(),
        name: newName.trim(),
        domain: newDomain.trim(),
        description: newDescription.trim(),
      })
      await loadWorkflows()
      // 关闭新建弹窗并重置表单
      setShowCreate(false)
      const createdKey = newFileName.trim()
      setNewFileName('')
      setNewName('')
      setNewDomain('')
      setNewDescription('')
      // 创建后直接打开编辑器查看/继续编辑（同时加载技能速查表）
      const [content] = await Promise.all([
        fetchWorkflowContent(createdKey),
        ensureSkillsLoaded(),
      ])
      setEditorContent(content)
      setEditingKey(createdKey)
      setEditingTitle(`data/workflows/${createdKey}.md`)
      setSaveMsg('')
    } catch (err) {
      setCreateError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }, [newFileName, newName, newDomain, newDescription, loadWorkflows, ensureSkillsLoaded])

  // 删除工作流
  const handleDelete = useCallback(async () => {
    if (!deletingKey) return
    setDeleting(true)
    try {
      await deleteWorkflow(deletingKey)
      await loadWorkflows()
      // 如果正在编辑该工作流，关闭编辑器
      if (editingKey === deletingKey) {
        setEditingKey(null)
      }
      setDeletingKey(null)
    } catch (err) {
      console.error('删除工作流失败:', err)
    } finally {
      setDeleting(false)
    }
  }, [deletingKey, editingKey, loadWorkflows])

  return (
    <>
      {/* ===== 触发按钮 + 下拉（相对定位，由父容器控制） ===== */}
      <div ref={rootRef} className="relative inline-block">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)]/50 transition-all"
          title="我的工作流"
        >
          <Workflow size={12} className="text-[var(--color-primary)]" />
          <span>工作流</span>
          {!loading && (
            <span className="text-[10px] px-1 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
              {workflows.length}
            </span>
          )}
          <ChevronDown
            size={10}
            className={`transition-transform text-[var(--color-text-muted)] ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {/* 下拉列表面板 */}
        {open && (
          <div className="absolute top-full right-0 mt-1 w-80 max-h-[70vh] overflow-y-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-2xl z-40">
            {/* 头部 */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="flex items-center gap-1.5">
                <Workflow size={12} className="text-[var(--color-primary)]" />
                <span className="text-xs font-semibold text-[var(--color-text)]">我的工作流</span>
              </div>
              <button
                onClick={() => { setShowCreate(true); setCreateError(''); setOpen(false) }}
                className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
                title="新建工作流"
              >
                <Plus size={10} />
                新建
              </button>
            </div>

            {/* 列表 */}
            <div className="p-2 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-6 text-[var(--color-text-muted)] text-xs">
                  <Loader2 size={12} className="animate-spin mr-1.5" />
                  加载中...
                </div>
              ) : workflows.length === 0 ? (
                <div className="py-6 text-center text-xs text-[var(--color-text-muted)]">
                  暂无工作流模板
                  <div className="mt-1 text-[10px] opacity-70">
                    在 data/workflows/ 下添加 .md 文件即可
                  </div>
                </div>
              ) : (
                workflows.map(wf => (
                  <div key={wf.file_name} className="group relative">
                    {/* 悬浮删除按钮（右上角） */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingKey(wf.file_name) }}
                      className="absolute top-1 right-1 z-10 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-red-500/80 text-white hover:bg-red-500 transition-all shadow-sm"
                      title={`删除 ${wf.name || wf.file_name}`}
                    >
                      <X size={10} />
                    </button>
                  <button
                    onClick={() => handleOpen(wf)}
                    className="w-full text-left px-2.5 py-2 rounded-md border border-transparent hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 transition-all"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FileText size={11} className="text-[var(--color-primary)] flex-shrink-0" />
                      <span className="text-xs font-medium text-[var(--color-text)] truncate">
                        {wf.name || wf.file_name}
                      </span>
                      {wf.domain && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent)] flex-shrink-0">
                          {wf.domain}
                        </span>
                      )}
                      <span className="text-[9px] text-[var(--color-text-muted)] ml-auto flex-shrink-0">
                        {wf.phase_count} phases
                      </span>
                    </div>
                    {wf.description && (
                      <div className="text-[10px] text-[var(--color-text-muted)] line-clamp-2 pl-4">
                        {wf.description}
                      </div>
                    )}
                    {wf.keywords && wf.keywords.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 pl-4">
                        {wf.keywords.slice(0, 4).map(k => (
                          <span
                            key={k}
                            className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-border)]/40 text-[var(--color-text-muted)]"
                          >
                            {k}
                          </span>
                        ))}
                        {wf.keywords.length > 4 && (
                          <span className="text-[9px] text-[var(--color-text-muted)]">
                            +{wf.keywords.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== 新建工作流弹窗 ===== */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4 flex items-center gap-1.5">
              <Workflow size={14} className="text-[var(--color-primary)]" />
              新建工作流
            </h3>

            {/* 文件名（必填） */}
            <div className="mb-3">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">
                文件名 <span className="text-red-400">*</span>
                <span className="ml-1 opacity-60">(英文/数字/连字符，不含 .md)</span>
              </label>
              <input
                type="text"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                placeholder="如 my-workflow"
                className="w-full px-3 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>

            {/* 中文名（可选） */}
            <div className="mb-3">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">中文名（可选）</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="如 我的工作流"
                className="w-full px-3 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            {/* 领域 + 描述 */}
            <div className="mb-3">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">领域 domain（可选）</label>
              <input
                type="text"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                placeholder="如 data_analysis"
                className="w-full px-3 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">简介（可选）</label>
              <input
                type="text"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder="一句话说明适用场景"
                className="w-full px-3 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            {createError && (
              <div className="mb-3 text-xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-md">
                {createError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-xs rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-border)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-1 px-4 py-1.5 text-xs rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-all"
              >
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 删除确认弹窗 ===== */}
      {deletingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trash2 size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold text-[var(--color-text)]">确认删除</h3>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              确定要删除工作流 <strong className="text-[var(--color-text)]">{deletingKey}</strong> 吗？
            </p>
            <p className="text-xs text-red-400/80 mb-4">
              此操作不可撤销，将物理删除 data/workflows/{deletingKey}.md 文件。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingKey(null)}
                className="px-3 py-1.5 text-xs rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-border)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 px-4 py-1.5 text-xs rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-all"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Monaco 编辑器弹窗（查看 + 编辑 + 保存 + 右侧技能速查）===== */}
      {editingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          {/* 弹窗更宽一些以容纳右侧速查面板 */}
          <div className="w-[92vw] max-w-6xl h-[82vh] bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] flex flex-col shadow-2xl">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Workflow size={14} className="text-[var(--color-primary)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">{editingTitle}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                  工作流
                </span>
                {saveMsg && (
                  <span className="text-xs text-[var(--color-text-muted)]">{saveMsg}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  保存
                </button>
                <button
                  onClick={() => setEditingKey(null)}
                  className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] transition-colors"
                  title="关闭"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* 主体：左 Monaco + 右技能速查 */}
            <div className="flex-1 overflow-hidden flex">
              {/* 左：Monaco 编辑器 */}
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  defaultLanguage="markdown"
                  theme="vs-dark"
                  value={editorContent}
                  onChange={(val) => setEditorContent(val || '')}
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    padding: { top: 8 },
                  }}
                />
              </div>

              {/* 右：技能速查面板 */}
              <div className="w-64 flex-shrink-0 border-l border-[var(--color-border)] flex flex-col bg-[var(--color-bg)]">
                {/* 标题 + 说明 */}
                <div className="px-3 py-2 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Tag size={12} className="text-[var(--color-accent)]" />
                    <span className="text-xs font-semibold text-[var(--color-text)]">技能速查</span>
                    <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
                      {skills.length} 个
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] leading-tight">
                    点击项目复制英文 ID，粘贴到 <code className="text-[var(--color-accent)]">skill:</code> 字段
                  </p>
                </div>

                {/* 搜索框 */}
                <div className="px-2 py-1.5 border-b border-[var(--color-border)]">
                  <input
                    type="text"
                    value={skillFilter}
                    onChange={e => setSkillFilter(e.target.value)}
                    placeholder="搜索中文名 / 英文ID..."
                    className="w-full px-2 py-1 text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]/50"
                  />
                </div>

                {/* 列表（按分类分组） */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
                  {skills.length === 0 ? (
                    <div className="text-center py-4 text-[10px] text-[var(--color-text-muted)]">
                      加载中...
                    </div>
                  ) : (
                    (() => {
                      // 过滤 + 分组
                      const kw = skillFilter.trim().toLowerCase()
                      const filtered = kw
                        ? skills.filter(s =>
                            s.name.toLowerCase().includes(kw) ||
                            s.dir_name.toLowerCase().includes(kw) ||
                            (s.summary || '').toLowerCase().includes(kw)
                          )
                        : skills
                      const grouped = filtered.reduce<Record<string, SkillInfo[]>>((acc, s) => {
                        const cat = s.category || '其他'
                        if (!acc[cat]) acc[cat] = []
                        acc[cat].push(s)
                        return acc
                      }, {})
                      const entries = Object.entries(grouped)
                      if (entries.length === 0) {
                        return (
                          <div className="text-center py-4 text-[10px] text-[var(--color-text-muted)]">
                            无匹配项
                          </div>
                        )
                      }
                      return entries.map(([cat, items]) => (
                        <div key={cat}>
                          <div className="text-[9px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1 px-1">
                            {cat}
                          </div>
                          <div className="space-y-0.5">
                            {items.map(s => {
                              const copied = copiedDir === s.dir_name
                              return (
                                <button
                                  key={s.dir_name}
                                  onClick={() => handleCopyDirName(s.dir_name)}
                                  title={s.summary || s.description || '点击复制英文 ID'}
                                  className={`w-full text-left px-2 py-1.5 rounded transition-all border ${
                                    copied
                                      ? 'bg-[var(--color-success)]/15 border-[var(--color-success)]/40'
                                      : 'bg-[var(--color-surface)] border-transparent hover:border-[var(--color-primary)]/40'
                                  }`}
                                >
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <span className="text-[11px] font-medium text-[var(--color-text)] truncate flex-1">
                                      {s.name}
                                    </span>
                                    {copied ? (
                                      <Check size={10} className="text-[var(--color-success)] flex-shrink-0" />
                                    ) : (
                                      <Copy size={10} className="text-[var(--color-text-muted)] flex-shrink-0 opacity-60" />
                                    )}
                                  </div>
                                  <div className={`text-[10px] font-mono truncate ${
                                    copied ? 'text-[var(--color-success)]' : 'text-[var(--color-accent)]'
                                  }`}>
                                    {s.dir_name}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    })()
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
