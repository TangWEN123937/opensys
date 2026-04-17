"""
ask_user Tool — 请求用户介入

这是 OpenSys 三大基础 Tool 之一。
当 AI Agent 遇到以下情况时调用此工具：
1. 需要用户提供信息（密码、选择、确认等）
2. 遇到无法自行解决的问题，需要人工帮助
3. 操作执行失败多次，需要用户指导

此工具利用 LangGraph 的 interrupt() 机制暂停图执行，
等待用户通过 WebSocket/CLI 回复后继续。
无人值守模式下自动返回"已确认"，跳过人工等待。
"""

from typing import Annotated

from langgraph.types import interrupt
from langgraph.prebuilt import InjectedState
from langchain_core.tools import tool


@tool
def ask_user(
    question: str,
    context: str = "",
    state: Annotated[dict, InjectedState] = None,
) -> str:
    """暂停执行，向用户提问并等待回复。

    当你需要用户提供信息、做出选择、或需要人工帮助时调用此工具。
    调用后 Agent 会暂停，等用户回复后继续执行。

    Args:
        question: 向用户提出的问题（清晰、具体）
        context: 可选的上下文说明，帮助用户理解为什么需要这个信息

    Returns:
        用户的回复内容
    """
    # 构建提问信息
    prompt = question
    if context:
        prompt = f"{question}\n\n📋 背景信息: {context}"

    # 无人值守模式：自动回复，跳过 interrupt
    if state and state.get("unattended"):
        print(f"[ask_user] 无人值守模式，自动确认: {question[:80]}")
        return "已确认，请继续执行"

    # 使用 LangGraph interrupt() 暂停图执行
    # 用户通过 WebSocket/CLI 回复后，回复内容作为返回值继续执行
    user_response = interrupt(
        {
            "type": "ask_user",
            "question": prompt,
        }
    )

    return user_response
