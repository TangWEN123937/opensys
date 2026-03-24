"""
OpenSys 数据库管理器

负责初始化 SQLite 数据库、执行 schema 迁移、
提供审批记忆和审计日志的 CRUD 操作。

与 LangGraph 的 AsyncSqliteSaver 共用同一个 SQLite 文件，
但管理独立的扩展表（approval_history, conversations, audit_logs 等）。
"""

import json
import aiosqlite
from pathlib import Path
from datetime import datetime
from typing import Optional

from ..config import DB_PATH


# Schema 文件路径
SCHEMA_PATH = Path(__file__).parent / "schema.sql"


class DatabaseManager:
    """
    异步数据库管理器（单例）

    用法:
        db = DatabaseManager()
        await db.initialize()
        await db.log_audit(thread_id="xxx", event_type="tool_call", ...)
        await db.close()
    """

    _instance: Optional["DatabaseManager"] = None
    _conn: Optional[aiosqlite.Connection] = None

    def __new__(cls):
        """单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self) -> None:
        """初始化数据库连接并执行 schema 迁移"""
        if self._conn is not None:
            return

        self._conn = await aiosqlite.connect(str(DB_PATH))
        # 启用 WAL 模式，提高并发读写性能
        await self._conn.execute("PRAGMA journal_mode=WAL")
        # 执行 schema
        schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
        await self._conn.executescript(schema_sql)
        await self._conn.commit()

    async def close(self) -> None:
        """关闭数据库连接"""
        if self._conn:
            await self._conn.close()
            self._conn = None

    @property
    def conn(self) -> aiosqlite.Connection:
        """获取数据库连接"""
        if self._conn is None:
            raise RuntimeError("数据库未初始化，请先调用 initialize()")
        return self._conn

    # ==================== 审批记忆 ====================

    async def record_approval(
        self,
        fingerprint: str,
        command: str,
        tool_name: str,
        risk_level: str,
        result: str,
        auth_level: int,
        thread_id: str = "",
    ) -> None:
        """记录一次审批操作"""
        await self.conn.execute(
            """INSERT INTO approval_history
               (fingerprint, command, tool_name, risk_level, result, auth_level, thread_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (fingerprint, command, tool_name, risk_level, result, auth_level, thread_id),
        )
        await self.conn.commit()

    async def get_approval_history(
        self, fingerprint: str, limit: int = 20
    ) -> list[dict]:
        """查询指定指纹的审批历史"""
        cursor = await self.conn.execute(
            """SELECT fingerprint, command, result, auth_level, created_at
               FROM approval_history
               WHERE fingerprint = ?
               ORDER BY created_at DESC
               LIMIT ?""",
            (fingerprint, limit),
        )
        rows = await cursor.fetchall()
        return [
            {
                "fingerprint": r[0],
                "command": r[1],
                "result": r[2],
                "auth_level": r[3],
                "created_at": r[4],
            }
            for r in rows
        ]

    # ==================== 对话管理 ====================

    async def create_conversation(self, thread_id: str, title: str = "") -> None:
        """创建或更新对话记录"""
        await self.conn.execute(
            """INSERT INTO conversations (thread_id, title, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(thread_id) DO UPDATE SET
                   title = COALESCE(NULLIF(excluded.title, ''), conversations.title),
                   updated_at = excluded.updated_at""",
            (thread_id, title, datetime.now().isoformat()),
        )
        await self.conn.commit()

    async def list_conversations(self, status: str = "active") -> list[dict]:
        """列出所有对话"""
        cursor = await self.conn.execute(
            """SELECT thread_id, title, status, message_count, created_at, updated_at
               FROM conversations
               WHERE status = ?
               ORDER BY updated_at DESC""",
            (status,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "thread_id": r[0],
                "title": r[1] or "未命名对话",
                "status": r[2],
                "message_count": r[3],
                "created_at": r[4],
                "updated_at": r[5],
            }
            for r in rows
        ]

    async def get_latest_conversation(self) -> Optional[dict]:
        """获取最近一个活跃对话（按 updated_at 降序取第一条）"""
        cursor = await self.conn.execute(
            """SELECT thread_id, title, status, message_count, created_at, updated_at
               FROM conversations
               WHERE status = 'active'
               ORDER BY updated_at DESC
               LIMIT 1"""
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return {
            "thread_id": row[0],
            "title": row[1] or "未命名对话",
            "status": row[2],
            "message_count": row[3],
            "created_at": row[4],
            "updated_at": row[5],
        }

    async def get_conversation_by_id(self, thread_id: str) -> Optional[dict]:
        """根据 thread_id 前缀模糊匹配对话（支持短 ID 查找）"""
        cursor = await self.conn.execute(
            """SELECT thread_id, title, status, message_count, created_at, updated_at
               FROM conversations
               WHERE thread_id LIKE ? AND status = 'active'
               ORDER BY updated_at DESC
               LIMIT 5""",
            (thread_id + "%",),
        )
        rows = await cursor.fetchall()
        if len(rows) == 1:
            r = rows[0]
            return {
                "thread_id": r[0],
                "title": r[1] or "未命名对话",
                "status": r[2],
                "message_count": r[3],
                "created_at": r[4],
                "updated_at": r[5],
            }
        elif len(rows) > 1:
            # 多个匹配，返回 None 让调用方提示用户更精确输入
            return None
        return None

    async def update_conversation_title(self, thread_id: str, title: str) -> None:
        """更新对话标题"""
        await self.conn.execute(
            "UPDATE conversations SET title = ?, updated_at = ? WHERE thread_id = ?",
            (title, datetime.now().isoformat(), thread_id),
        )
        await self.conn.commit()

    # ==================== 审计日志 ====================

    async def log_audit(
        self,
        event_type: str,
        thread_id: str = "",
        tool_name: str = "",
        details: dict = None,
        risk_level: str = "",
        result: str = "",
    ) -> None:
        """写入审计日志"""
        await self.conn.execute(
            """INSERT INTO audit_logs
               (thread_id, event_type, tool_name, details, risk_level, result)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                thread_id,
                event_type,
                tool_name,
                json.dumps(details or {}, ensure_ascii=False),
                risk_level,
                result,
            ),
        )
        await self.conn.commit()

    async def get_audit_logs(
        self, thread_id: str = "", limit: int = 50
    ) -> list[dict]:
        """查询审计日志"""
        if thread_id:
            cursor = await self.conn.execute(
                """SELECT id, thread_id, event_type, tool_name, details, risk_level, result, created_at
                   FROM audit_logs WHERE thread_id = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (thread_id, limit),
            )
        else:
            cursor = await self.conn.execute(
                """SELECT id, thread_id, event_type, tool_name, details, risk_level, result, created_at
                   FROM audit_logs
                   ORDER BY created_at DESC LIMIT ?""",
                (limit,),
            )
        rows = await cursor.fetchall()
        return [
            {
                "id": r[0],
                "thread_id": r[1],
                "event_type": r[2],
                "tool_name": r[3],
                "details": json.loads(r[4]) if r[4] else {},
                "risk_level": r[5],
                "result": r[6],
                "created_at": r[7],
            }
            for r in rows
        ]
