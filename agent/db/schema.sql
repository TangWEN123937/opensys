-- ==================== OpenSys SQLite 数据库表结构 ====================
-- 注意：LangGraph 的 checkpoint 表由 AsyncSqliteSaver 自动创建，
-- 此文件定义 OpenSys 自有的扩展表。

-- ==================== 审批记忆表 ====================
-- 记录每次用户审批操作，用于渐进式授权的置信度计算

CREATE TABLE IF NOT EXISTS approval_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 操作指纹（命令模式的哈希，如 "apt install *" → 指纹）
    fingerprint TEXT NOT NULL,
    -- 原始命令内容
    command TEXT NOT NULL,
    -- 工具名称：run_terminal / write_and_run_script
    tool_name TEXT NOT NULL,
    -- 风险等级：safe / moderate / dangerous
    risk_level TEXT NOT NULL,
    -- 审批结果：approved / rejected / modified
    result TEXT NOT NULL,
    -- 审批时的授权等级
    auth_level INTEGER NOT NULL DEFAULT 1,
    -- 对话线程 ID
    thread_id TEXT,
    -- 创建时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 指纹索引：快速查询同类操作的审批历史
CREATE INDEX IF NOT EXISTS idx_approval_fingerprint ON approval_history(fingerprint);
-- 时间索引：用于时间衰减计算
CREATE INDEX IF NOT EXISTS idx_approval_created ON approval_history(created_at);


-- ==================== 对话索引表 ====================
-- 管理所有对话（补充 LangGraph checkpoint 的元信息）

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 对话线程 ID（与 LangGraph checkpoint 的 thread_id 对应）
    thread_id TEXT UNIQUE NOT NULL,
    -- 对话标题（自动生成的话题摘要）
    title TEXT,
    -- 对话状态：active / archived
    status TEXT DEFAULT 'active',
    -- 消息数量（定期更新）
    message_count INTEGER DEFAULT 0,
    -- 创建时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- 最后活跃时间
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);


-- ==================== 审计日志表 ====================
-- 记录所有 AI 操作，用于安全审计和回溯

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 对话线程 ID
    thread_id TEXT,
    -- 事件类型：tool_call / approval / error / system
    event_type TEXT NOT NULL,
    -- 工具名称（tool_call 事件时填写）
    tool_name TEXT,
    -- 事件详情（JSON 格式）
    details TEXT,
    -- 风险等级
    risk_level TEXT,
    -- 执行结果：success / failed / rejected / timeout
    result TEXT,
    -- 创建时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_thread ON audit_logs(thread_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);


-- ==================== 网络白名单表 ====================
-- 动态管理容器的出站网络白名单

CREATE TABLE IF NOT EXISTS network_whitelist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- 域名（如 api.openai.com）
    domain TEXT UNIQUE NOT NULL,
    -- 来源：preset（预设）/ user_approved（用户审批添加）
    source TEXT NOT NULL DEFAULT 'preset',
    -- 审批该域名的对话线程 ID（user_approved 时记录）
    approved_thread_id TEXT,
    -- 是否启用
    enabled INTEGER DEFAULT 1,
    -- 创建时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whitelist_domain ON network_whitelist(domain);
