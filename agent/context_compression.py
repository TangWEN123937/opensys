"""
上下文自动压缩模块

适配 LangGraph StateGraph 架构，在 agent_node 每次调用 LLM 前执行：
1. 图片渐进式压缩：按消息年龄分阶段压缩（原图 → 400x400 → 200x200 → 删除）
2. 文本摘要压缩：当消息数量或 token 超阈值时，对旧消息进行摘要压缩

设计参考：AI_JOIN 的 MultimodalSummarizationMiddleware
- 图片压缩策略完全复用
- 文本摘要使用 LLM 而非官方 SummarizationMiddleware（因为 OpenSys 是 StateGraph 而非 Agent）
- 通过 RemoveMessage + add_messages reducer 安全地更新 checkpoint 中的消息

核心区别：
- AI_JOIN 通过 AgentMiddleware.abefore_model 钩子触发
- OpenSys 通过 agent_node 中显式调用 compress_context() 触发
"""

import base64
from io import BytesIO
from typing import Optional
from copy import deepcopy

from PIL import Image
from langchain_core.messages import (
    BaseMessage, AIMessage, HumanMessage, SystemMessage, ToolMessage,
    RemoveMessage,
)

from . import config


# ==================== 图片压缩配置 ====================

# 渐进压缩阶段（与 AI_JOIN 一致）
IMAGE_STAGES = [
    {"max_size": 400, "quality": 60},   # 阶段 0：压缩到 400x400
    {"max_size": 200, "quality": 40},   # 阶段 1：压缩到 200x200
    None,                                # 阶段 2：删除图片
]


# ==================== 主入口 ====================

def compress_context(
    messages: list[BaseMessage],
    keep_images_recent: int = 6,
    image_stage_interval: int = 10,
) -> list[BaseMessage]:
    """
    压缩上下文：图片渐进压缩 + 返回处理后的消息列表

    此函数在 agent_node 中每次 LLM 调用前执行，原地压缩老旧图片。
    文本摘要压缩由 summarize_old_messages() 单独处理（需要异步调用 LLM）。

    Args:
        messages: 当前消息列表
        keep_images_recent: 最近多少条消息中的图片保持原样
        image_stage_interval: 每隔多少条消息升级一次压缩阶段

    Returns:
        处理后的消息列表（图片已压缩）
    """
    _compress_old_images(messages, keep_images_recent, image_stage_interval)
    return messages


async def summarize_old_messages(
    messages: list[BaseMessage],
    llm,
    trigger_messages: int = None,
    trigger_tokens: int = None,
    keep_messages: int = None,
) -> Optional[dict]:
    """
    当消息数量或 token 超阈值时，对旧消息进行摘要压缩

    策略：
    1. 检查是否需要压缩（消息数 > trigger_messages 或 token > trigger_tokens）
    2. 将最旧的 N 条消息（保留最近 keep_messages 条）交给 LLM 摘要
    3. 返回 state update：删除旧消息 + 插入摘要消息

    Args:
        messages: 当前消息列表（不包含 SystemMessage）
        llm: 用于生成摘要的 LLM 实例
        trigger_messages: 触发压缩的消息数阈值
        trigger_tokens: 触发压缩的 token 数阈值
        keep_messages: 压缩后保留的最近消息数

    Returns:
        state update dict（包含 RemoveMessage 和摘要 HumanMessage），
        或 None（不需要压缩）
    """
    trigger_messages = trigger_messages or config.COMPRESS_TRIGGER_MESSAGES
    trigger_tokens = trigger_tokens or config.COMPRESS_TRIGGER_TOKENS
    keep_messages = keep_messages or config.COMPRESS_KEEP_MESSAGES

    # 过滤掉 SystemMessage，只统计用户对话消息
    non_system = [m for m in messages if not isinstance(m, SystemMessage)]

    # 检查是否需要压缩
    msg_count = len(non_system)
    if msg_count <= trigger_messages:
        # 消息数未超阈值，检查 token（简单估算）
        total_chars = sum(_estimate_message_chars(m) for m in non_system)
        estimated_tokens = total_chars // 3  # 粗估：3 字符 ≈ 1 token（中文约 2 字符/token）
        if estimated_tokens <= trigger_tokens:
            return None

    # 需要压缩：分割为 [旧消息] 和 [保留消息]
    split_idx = _find_safe_split_point(non_system, keep_messages)
    if split_idx <= 0:
        return None  # 没有可压缩的消息

    old_messages = non_system[:split_idx]
    print(f"[上下文压缩] 触发摘要：总 {msg_count} 条消息，压缩前 {split_idx} 条")

    # 构建摘要请求
    summary_prompt = _build_summary_prompt(old_messages)

    try:
        # 调用 LLM 生成摘要（使用不带工具绑定的基础模型）
        summary_response = await llm.ainvoke([HumanMessage(content=summary_prompt)])
        summary_text = summary_response.content if isinstance(summary_response.content, str) else str(summary_response.content)
    except Exception as e:
        print(f"[上下文压缩] 摘要生成失败: {e}")
        return None

    # 构建 state update：使用 RemoveMessage 删除旧消息 + 插入摘要
    remove_msgs = [RemoveMessage(id=m.id) for m in old_messages if hasattr(m, 'id') and m.id]
    summary_msg = HumanMessage(
        content=f"[以下是之前对话的摘要]\n{summary_text}\n[摘要结束，以下是最近的对话]"
    )

    print(f"[上下文压缩] 摘要完成：{split_idx} 条消息 → 1 条摘要（{len(summary_text)} 字符）")

    return {
        "messages": remove_msgs + [summary_msg],
    }


# ==================== 图片压缩（复用 AI_JOIN 逻辑） ====================

def _compress_old_images(
    messages: list[BaseMessage],
    keep_images_recent: int,
    image_stage_interval: int,
) -> None:
    """
    按消息年龄压缩图片（原地修改消息内容）

    策略（与 AI_JOIN 完全一致）：
    - 最近 keep_images_recent 条消息：图片保持原样
    - 之后每 image_stage_interval 条消息升级一次压缩阶段
    - 阶段 0：压缩到 400x400
    - 阶段 1：压缩到 200x200
    - 阶段 2+：删除图片，替换为 [图片已过期]
    """
    total = len(messages)
    if total <= keep_images_recent:
        return

    # 从前往后处理（索引越小 = 越老）
    for i in range(total - keep_images_recent):
        msg = messages[i]
        if not isinstance(msg.content, list):
            continue

        # 计算该消息应处于的压缩阶段
        age = total - i  # 距离末尾的距离
        stage = (age - keep_images_recent) // image_stage_interval
        stage = min(stage, len(IMAGE_STAGES) - 1)

        if stage < 0:
            continue

        new_content = []
        content_changed = False

        for item in msg.content:
            if not isinstance(item, dict) or item.get("type") != "image_url":
                new_content.append(item)
                continue

            image_url = item.get("image_url", {}).get("url", "")
            if "base64," not in image_url:
                new_content.append(item)
                continue

            stage_config = IMAGE_STAGES[stage]

            if stage_config is None:
                # 最终阶段：删除图片，替换为文本占位
                new_content.append({"type": "text", "text": "[图片已过期，已自动移除]"})
                content_changed = True
            else:
                # 压缩图片
                compressed = _compress_single_image(
                    image_url, stage_config["max_size"], stage_config["quality"]
                )
                if compressed and compressed != image_url:
                    new_content.append({
                        "type": "image_url",
                        "image_url": {"url": compressed}
                    })
                    content_changed = True
                else:
                    new_content.append(item)

        if content_changed:
            msg.content = new_content


def _compress_single_image(
    image_data_url: str, max_size: int, quality: int
) -> Optional[str]:
    """
    压缩单张 base64 图片（与 AI_JOIN 实现完全一致）

    Args:
        image_data_url: 完整的 data URL（如 data:image/png;base64,xxxx）
        max_size: 目标最大边长
        quality: JPEG 压缩质量

    Returns:
        压缩后的 data URL，失败时返回 None
    """
    try:
        # 解析 data URL
        header, base64_data = image_data_url.split("base64,", 1)

        # 解码并打开图片
        raw_bytes = base64.b64decode(base64_data)
        img = Image.open(BytesIO(raw_bytes))

        # 检查是否需要缩放
        if max(img.width, img.height) <= max_size:
            pass  # 图片已经足够小，只做质量压缩
        else:
            ratio = max_size / max(img.width, img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        # 转换为 RGB（JPEG 不支持透明通道）
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")

        # 压缩并重新编码
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=quality, optimize=True)
        compressed_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        return f"data:image/jpeg;base64,{compressed_b64}"

    except Exception as e:
        print(f"[图片压缩] 压缩失败: {e}")
        return None


# ==================== 文本摘要辅助函数 ====================

def _estimate_message_chars(msg: BaseMessage) -> int:
    """估算单条消息的字符数"""
    content = msg.content
    if isinstance(content, str):
        return len(content)
    elif isinstance(content, list):
        total = 0
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    total += len(item.get("text", ""))
                elif item.get("type") == "image_url":
                    total += 200  # 图片按 200 字符估算
            elif isinstance(item, str):
                total += len(item)
        return total
    return 0


def _find_safe_split_point(messages: list[BaseMessage], keep: int) -> int:
    """
    找到安全的分割点，不打断 AI + ToolMessage 配对

    从 len(messages) - keep 位置向前搜索，确保不会把 AI 的 tool_call
    和对应的 ToolMessage 拆分到不同组。

    Returns:
        安全分割点索引（该索引之前的消息会被压缩）
    """
    target = len(messages) - keep
    if target <= 0:
        return 0

    # 向前搜索安全分割点
    idx = target
    while idx > 0:
        msg = messages[idx]
        # 不能从 ToolMessage 开始切（它需要对应的 AI tool_call）
        if isinstance(msg, ToolMessage):
            idx -= 1
            continue
        # 不能把 AI 的 tool_call 切掉（后面的 ToolMessage 会孤立）
        if isinstance(msg, AIMessage) and getattr(msg, 'tool_calls', None):
            idx -= 1
            continue
        # 找到安全点
        break

    return max(idx, 0)


def _build_summary_prompt(messages: list[BaseMessage]) -> str:
    """构建摘要请求提示词"""
    # 将消息转换为可读文本
    conversation_text = []
    for msg in messages:
        role = "用户" if isinstance(msg, HumanMessage) else "AI" if isinstance(msg, AIMessage) else "工具"
        content = msg.content
        if isinstance(content, list):
            # 多模态消息：提取文本部分
            text_parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(item.get("text", ""))
                elif isinstance(item, dict) and item.get("type") == "image_url":
                    text_parts.append("[图片]")
                elif isinstance(item, str):
                    text_parts.append(item)
            content = " ".join(text_parts)
        # 截断过长内容
        if len(content) > 500:
            content = content[:500] + "..."
        conversation_text.append(f"[{role}] {content}")

    conversation = "\n".join(conversation_text)

    return f"""请对以下对话进行简洁摘要，保留关键信息：
1. 用户的主要需求和目标
2. AI 执行的关键操作和结果
3. 重要的决策和结论
4. 遇到的问题和解决方案

对话内容：
{conversation}

请用中文输出摘要（200-400字）："""
