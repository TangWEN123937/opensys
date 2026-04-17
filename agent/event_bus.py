"""
OpenSys 全局事件总线（轻量级）

用于跨模块通信，主要场景：
- skill_loader 加载技能时发布 skill_loaded 事件
- API 层（SSE/WebSocket）消费事件并推送给前端

设计：简单的发布-订阅模式，使用 asyncio.Queue 传递事件。
每个 SSE/WS 连接创建自己的订阅队列，事件广播到所有订阅者。
"""

import asyncio
from typing import Any


# 全局订阅者列表：每个活跃的 SSE/WS 连接注册一个 asyncio.Queue
_subscribers: list[asyncio.Queue] = []


def subscribe() -> asyncio.Queue:
    """创建一个新的事件订阅队列（SSE/WS 连接启动时调用）"""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue):
    """移除订阅队列（SSE/WS 连接关闭时调用）"""
    try:
        _subscribers.remove(q)
    except ValueError:
        pass


def publish(event: dict[str, Any]):
    """发布事件到所有订阅者（同步调用，非阻塞）"""
    for q in _subscribers:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass  # 队列满则丢弃，不阻塞发布方
