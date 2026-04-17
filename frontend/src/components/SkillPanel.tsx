/**
 * 技能标签面板
 *
 * 右下区域：
 * 1. 系统配置区 — memory.md / user_prompt.md / project.md（只能编辑，不能删除）
 * 2. 技能标签区 — 按分类展示所有技能，高亮当前加载的技能
 * 支持：点击编辑、新建技能、删除技能
 */

import { useEffect, useState, useCallback } from 'react'
import { Tag, X, Save, Loader2, FolderOpen, Settings, Plus, Trash2 } from 'lucide-react'
import Editor from '@monaco-editor/react'
import {
  fetchSkills, fetchSkillContent, saveSkillContent, createSkill, deleteSkill,
  fetchSystemConfigs, fetchSystemConfigContent, saveSystemConfigContent,
  type SystemConfigInfo,
} from '../api'
import type { SkillInfo } from '../types'

interface SkillPanelProps {
  /** 当前已加载的技能名称集合 */
  loadedSkills: Set<string>
}

/** 编辑器打开的文件类型 */
type EditingTarget =
  | { type: 'skill'; key: string; title: string }
  | { type: 'config'; key: string; title: string }

export default function SkillPanel({ loadedSkills }: SkillPanelProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [configs, setConfigs] = useState<SystemConfigInfo[]>([])
  const [loading, setLoading] = useState(true)
  // 编辑器状态
  const [editing, setEditing] = useState<EditingTarget | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  // 新建技能弹窗
  const [showCreate, setShowCreate] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  // 删除确认弹窗
  const [deletingSkill, setDeletingSkill] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 加载技能列表 + 系统配置列表
  const refreshSkills = useCallback(async () => {
    try {
      const data = await fetchSkills()
      setSkills(data)
    } catch (err) {
      console.error('加载技能列表失败:', err)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetchSkills().catch(err => { console.error('加载技能列表失败:', err); return [] }),
      fetchSystemConfigs().catch(err => { console.error('加载系统配置失败:', err); return [] }),
    ]).then(([skillsData, configsData]) => {
      setSkills(skillsData)
      setConfigs(configsData)
    }).finally(() => setLoading(false))
  }, [])

  // 点击技能标签 → 打开编辑器
  const handleSkillClick = useCallback(async (dirName: string) => {
    try {
      const content = await fetchSkillContent(dirName)
      setEditorContent(content)
      setEditing({ type: 'skill', key: dirName, title: `${dirName}/SKILL.md` })
      setSaveMsg('')
    } catch (err) {
      console.error('加载技能内容失败:', err)
    }
  }, [])

  // 点击系统配置标签 → 打开编辑器
  const handleConfigClick = useCallback(async (cfg: SystemConfigInfo) => {
    try {
      const content = await fetchSystemConfigContent(cfg.key)
      setEditorContent(content)
      setEditing({ type: 'config', key: cfg.key, title: `data/${cfg.filename}` })
      setSaveMsg('')
    } catch (err) {
      console.error('加载配置内容失败:', err)
    }
  }, [])

  // 保存（根据 editing.type 调不同接口）
  const handleSave = useCallback(async () => {
    if (!editing) return
    setSaving(true)
    setSaveMsg('')
    try {
      if (editing.type === 'skill') {
        await saveSkillContent(editing.key, editorContent)
        await refreshSkills()
      } else {
        await saveSystemConfigContent(editing.key, editorContent)
      }
      setSaveMsg('✅ 已保存')
    } catch (err) {
      setSaveMsg(`❌ 保存失败: ${(err as Error).message}`)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }, [editing, editorContent, refreshSkills])

  // 新建技能
  const handleCreate = useCallback(async () => {
    if (!newDirName.trim()) { setCreateError('请输入技能目录名'); return }
    setCreating(true)
    setCreateError('')
    try {
      await createSkill(newDirName.trim(), newCategory.trim())
      await refreshSkills()
      setShowCreate(false)
      setNewDirName('')
      setNewCategory('')
      // 创建后直接打开编辑
      handleSkillClick(newDirName.trim())
    } catch (err) {
      setCreateError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }, [newDirName, newCategory, refreshSkills, handleSkillClick])

  // 删除技能
  const handleDelete = useCallback(async () => {
    if (!deletingSkill) return
    setDeleting(true)
    try {
      await deleteSkill(deletingSkill)
      await refreshSkills()
      // 如果正在编辑该技能，关闭编辑器
      if (editing?.type === 'skill' && editing.key === deletingSkill) {
        setEditing(null)
      }
      setDeletingSkill(null)
    } catch (err) {
      console.error('删除技能失败:', err)
    } finally {
      setDeleting(false)
    }
  }, [deletingSkill, editing, refreshSkills])

  // 提取已有分类列表（用于新建时下拉选择）
  const existingCategories = [...new Set(skills.map(s => s.category).filter(Boolean))]

  // 按分类分组技能
  const grouped = skills.reduce<Record<string, SkillInfo[]>>((acc, s) => {
    const cat = s.category || '其他'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">🏷️ 技能</h2>
          {loadedSkills.size > 0 && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-success)]/20 text-[var(--color-success)]">
              {loadedSkills.size} 激活
            </span>
          )}
        </div>
        {/* 新建技能按钮 */}
        <button
          onClick={() => { setShowCreate(true); setCreateError('') }}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-[var(--color-primary)] hover:bg-[var(--color-surface)] transition-colors"
          title="新建技能"
        >
          <Plus size={14} />
          新建
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--color-text-muted)] text-xs">
            <Loader2 size={14} className="animate-spin mr-2" />
            加载中...
          </div>
        ) : (
          <>
            {/* ========== 系统配置区（不可删除） ========== */}
            {configs.length > 0 && (
              <div>
                <div className="text-xs text-[var(--color-accent)] mb-1.5 uppercase tracking-wide flex items-center gap-1">
                  <Settings size={10} />
                  系统配置
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {configs.map(cfg => (
                    <button
                      key={cfg.key}
                      onClick={() => handleConfigClick(cfg)}
                      title={cfg.description}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer border bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 hover:border-[var(--color-accent)]/50"
                    >
                      <Settings size={10} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ========== 技能标签区（按分类，可删除） ========== */}
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="text-xs text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wide">
                  {category}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(skill => {
                    const isActive = loadedSkills.has(skill.dir_name)
                    return (
                      <div key={skill.dir_name} className="group relative inline-flex">
                        {/* 技能标签 */}
                        <button
                          onClick={() => handleSkillClick(skill.dir_name)}
                          title={skill.summary || skill.description}
                          className={`
                            inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
                            transition-all cursor-pointer border
                            ${isActive
                              ? 'bg-[var(--color-success)]/20 border-[var(--color-success)]/50 text-[var(--color-success)] shadow-[0_0_8px_var(--color-success)/30]'
                              : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/50 hover:text-[var(--color-text)]'
                            }
                          `}
                        >
                          <Tag size={10} />
                          {skill.name}
                        </button>
                        {/* 删除按钮（悬浮显示） */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingSkill(skill.dir_name) }}
                          className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full bg-red-500/80 text-white hover:bg-red-500 transition-all shadow-sm"
                          title={`删除 ${skill.name}`}
                        >
                          <X size={8} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ========== 新建技能弹窗 ========== */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-[var(--color-text)] mb-4">新建技能</h3>

            {/* 目录名 */}
            <div className="mb-3">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">技能目录名 <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={newDirName}
                onChange={e => setNewDirName(e.target.value)}
                placeholder="如 my-new-skill（英文、数字、连字符）"
                className="w-full px-3 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>

            {/* 分类（可选） */}
            <div className="mb-4">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">分类（可选）</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="如 browser，留空则放在根目录"
                  className="flex-1 px-3 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              {/* 已有分类快捷选择 */}
              {existingCategories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {existingCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setNewCategory(cat)}
                      className={`px-1.5 py-0.5 text-xs rounded border transition-colors ${
                        newCategory === cat
                          ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 错误提示 */}
            {createError && (
              <div className="mb-3 text-xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-md">
                {createError}
              </div>
            )}

            {/* 按钮 */}
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

      {/* ========== 删除确认弹窗 ========== */}
      {deletingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trash2 size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold text-[var(--color-text)]">确认删除</h3>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              确定要删除技能 <strong className="text-[var(--color-text)]">{deletingSkill}</strong> 吗？
            </p>
            <p className="text-xs text-red-400/80 mb-4">
              此操作不可撤销，将删除整个技能目录及其下所有文件。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingSkill(null)}
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

      {/* ========== Monaco 编辑器弹窗（技能和系统配置共用） ========== */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[90vw] max-w-4xl h-[80vh] bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] flex flex-col shadow-2xl">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <FolderOpen size={14} className="text-[var(--color-accent)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">{editing.title}</span>
                {editing.type === 'config' && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-accent)]/20 text-[var(--color-accent)]">配置</span>
                )}
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
                  onClick={() => setEditing(null)}
                  className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* 编辑器区域 */}
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
          </div>
        </div>
      )}
    </div>
  )
}
