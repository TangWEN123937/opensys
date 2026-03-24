"""
安全的 Checkpoint Saver

包装 AsyncSqliteSaver，在序列化写入前自动清理消息中的
无效 Unicode surrogate 字符（\ud800-\udfff），防止
ormsgpack.MsgpackEncodeError 导致 astream_events 崩溃。

问题根因：
  LLM 流式输出或工具执行结果中可能包含 surrogate 字符，
  这些字符在 Python str 中合法，但 msgpack/utf-8 编码时会报错。
  LangGraph 使用 JsonPlusSerializer → ormsgpack 序列化 checkpoint，
  导致 'utf-8' codec can't encode: surrogates not allowed。

方案：
  包装 JsonPlusSerializer 的 dumps_typed 方法，在序列化前
  递归遍历对象，清理所有字符串中的 surrogate 字符。
"""

from typing import Any, Sequence

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
from langchain_core.messages import BaseMessage

from .utils import sanitize_text


class SafeJsonPlusSerializer(JsonPlusSerializer):
    """在序列化前自动清理 surrogate 字符的序列化器"""

    def dumps_typed(self, obj: Any) -> tuple[str, bytes]:
        """覆盖序列化方法，在编码前清理 surrogate"""
        obj = _deep_sanitize(obj)
        return super().dumps_typed(obj)


class SafeAsyncSqliteSaver(AsyncSqliteSaver):
    """使用安全序列化器的 AsyncSqliteSaver"""

    serde = SafeJsonPlusSerializer()


def _deep_sanitize(obj: Any) -> Any:
    """
    递归清理对象中所有字符串的 surrogate 字符。

    只处理常见的容器类型（dict/list/tuple），
    对 LangChain Message 对象直接清理 content 属性。
    """
    if isinstance(obj, str):
        return sanitize_text(obj)
    elif isinstance(obj, BaseMessage):
        # 直接清理消息 content（原地修改，避免深拷贝开销）
        if isinstance(obj.content, str):
            obj.content = sanitize_text(obj.content)
        elif isinstance(obj.content, list):
            obj.content = _deep_sanitize(obj.content)
        return obj
    elif isinstance(obj, dict):
        return {_deep_sanitize(k): _deep_sanitize(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_deep_sanitize(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(_deep_sanitize(item) for item in obj)
    return obj
