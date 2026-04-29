# -*- coding: utf-8 -*-
"""
自定义 DeepSeek Reasoner ChatModel for LangChain / LangGraph

通过继承 BaseChatModel 实现对 reasoning_content 的完整支持，
解决官方 langchain-deepseek 包在推理模型 + 工具调用场景下的兼容性问题：
1. API 响应中的 reasoning_content 被丢弃 → 保存到 additional_kwargs
2. 多轮工具调用时历史消息缺少 reasoning_content → 序列化时恢复
3. bind_tools 返回 RunnableBinding 导致后续调用不兼容 → 返回同类实例

参考: AI_JOIN/modules/langchain/agent/deepseek_reasoner_chat_model.py
"""

import json
import os
from typing import Any, Dict, Iterator, List, Optional

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from openai import OpenAI
from pydantic import Field


class DeepSeekReasonerChatModel(BaseChatModel):
    """
    自定义 DeepSeek Reasoner 模型，支持 reasoning_content 在工具调用循环中保留。

    关键特性：
    1. 在工具调用循环中保留 reasoning_content
    2. 将 reasoning_content 存储在 AIMessage.additional_kwargs 中
    3. 发送请求时从 additional_kwargs 恢复 reasoning_content
    """

    # --- 配置字段（由 _create_model_instance 传入） ---
    api_key: str = Field(default=None)
    base_url: str = Field(default="https://api.deepseek.com")
    model_name: str = Field(default="deepseek-reasoner")
    temperature: float = Field(default=0.7)
    timeout: float = Field(default=120.0)
    max_tokens: Optional[int] = Field(default=None)
    bound_tools: Optional[List[Dict]] = Field(default=None)

    # OpenAI 客户端（不序列化）
    _client: Optional[OpenAI] = None

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        # 初始化 OpenAI 客户端
        if not self.api_key:
            self.api_key = os.environ.get("OPENSYS_DEEPSEEK_API_KEY", "")

        self._client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=self.timeout,
        )

    @property
    def _llm_type(self) -> str:
        return "deepseek_reasoner"

    @property
    def _identifying_params(self) -> Dict[str, Any]:
        return {
            "model_name": self.model_name,
            "base_url": self.base_url,
            "temperature": self.temperature,
        }

    def _convert_messages_to_openai_format(
        self, messages: List[BaseMessage]
    ) -> List[Dict]:
        """
        将 LangChain 消息转换为 OpenAI 格式。

        关键：从 additional_kwargs 中恢复 reasoning_content，
        确保多轮工具调用时历史 assistant 消息携带原始思考链。
        """
        openai_messages = []

        for msg in messages:
            if isinstance(msg, HumanMessage):
                openai_messages.append({"role": "user", "content": msg.content})

            elif isinstance(msg, SystemMessage):
                openai_messages.append({"role": "system", "content": msg.content})

            elif isinstance(msg, AIMessage):
                msg_dict = {
                    "role": "assistant",
                    "content": msg.content or "",
                }

                # 处理 tool_calls（兼容 dict 和 ToolCall 对象两种格式）
                if hasattr(msg, "tool_calls") and msg.tool_calls:
                    tool_calls = []
                    for tc in msg.tool_calls:
                        tc_id = (
                            tc.get("id") if isinstance(tc, dict) else tc.id
                        )
                        tc_name = (
                            tc.get("name") if isinstance(tc, dict) else tc.name
                        )
                        tc_args = (
                            tc.get("args") if isinstance(tc, dict) else tc.args
                        )
                        tool_calls.append(
                            {
                                "id": tc_id,
                                "type": "function",
                                "function": {
                                    "name": tc_name,
                                    "arguments": json.dumps(
                                        tc_args, ensure_ascii=False
                                    ),
                                },
                            }
                        )
                    msg_dict["tool_calls"] = tool_calls

                # 【关键】从 additional_kwargs 恢复 reasoning_content
                if hasattr(msg, "additional_kwargs") and msg.additional_kwargs:
                    if "reasoning_content" in msg.additional_kwargs:
                        msg_dict["reasoning_content"] = msg.additional_kwargs[
                            "reasoning_content"
                        ]

                openai_messages.append(msg_dict)

            elif isinstance(msg, ToolMessage):
                openai_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": msg.tool_call_id,
                        "name": msg.name or "unknown",
                        "content": msg.content,
                    }
                )

        return openai_messages

    def _create_ai_message_from_response(self, response) -> AIMessage:
        """
        从 OpenAI 响应创建 AIMessage。

        关键：将 reasoning_content 保存到 additional_kwargs，
        以便下次发送请求时能恢复。
        """
        message = response.choices[0].message

        # 处理 tool_calls
        tool_calls = []
        if message.tool_calls:
            for tc in message.tool_calls:
                tool_calls.append(
                    {
                        "name": tc.function.name,
                        "args": json.loads(tc.function.arguments),
                        "id": tc.id,
                    }
                )

        # 【关键】保存 reasoning_content 到 additional_kwargs
        additional_kwargs = {}
        if hasattr(message, "reasoning_content") and message.reasoning_content:
            additional_kwargs["reasoning_content"] = message.reasoning_content
            print(
                f"[DeepSeek-Reasoner] 保存 reasoning_content "
                f"({len(message.reasoning_content)} 字符)"
            )

        # 构建 AIMessage
        ai_message_kwargs = {
            "content": message.content or "",
            "additional_kwargs": additional_kwargs,
        }

        # 只有在有 tool_calls 时才添加
        if tool_calls:
            ai_message_kwargs["tool_calls"] = tool_calls

        return AIMessage(**ai_message_kwargs)

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        """生成响应的核心方法"""
        # 转换消息
        openai_messages = self._convert_messages_to_openai_format(messages)

        # 准备请求参数
        request_params = {
            "model": self.model_name,
            "messages": openai_messages,
            "temperature": self.temperature,
        }

        # 添加 max_tokens（如果配置了）
        if self.max_tokens:
            request_params["max_tokens"] = self.max_tokens

        # 添加工具（如果有绑定）
        if self.bound_tools:
            request_params["tools"] = self.bound_tools

        # 调用 API
        response = self._client.chat.completions.create(**request_params)

        # 创建 AIMessage
        ai_message = self._create_ai_message_from_response(response)

        # 返回 ChatResult
        generation = ChatGeneration(message=ai_message)
        return ChatResult(generations=[generation])

    def _stream(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        """
        流式生成响应，让 LangGraph astream_events 能逐 token 推送 on_chat_model_stream 事件。

        流式模式下：
        - reasoning_content 在流结束后通过最后一个 chunk 的 additional_kwargs 传递
        - tool_calls 在流结束时一次性组装并通过最后一个 chunk 传递
        - content 逐 token 流式输出
        """
        # 转换消息
        openai_messages = self._convert_messages_to_openai_format(messages)

        # 准备请求参数
        request_params = {
            "model": self.model_name,
            "messages": openai_messages,
            "temperature": self.temperature,
            "stream": True,  # 开启流式
        }

        # 添加 max_tokens（如果配置了）
        if self.max_tokens:
            request_params["max_tokens"] = self.max_tokens

        # 添加工具（如果有绑定）
        if self.bound_tools:
            request_params["tools"] = self.bound_tools

        # 调用流式 API
        stream = self._client.chat.completions.create(**request_params)

        # 累积 reasoning_content 和 tool_calls 碎片
        full_reasoning = ""
        tool_call_chunks: Dict[int, Dict] = {}  # index → {id, name, arguments}

        for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if not delta:
                continue

            finish_reason = chunk.choices[0].finish_reason

            # 累积 reasoning_content（DeepSeek 推理模型特有字段）
            if hasattr(delta, "reasoning_content") and delta.reasoning_content:
                full_reasoning += delta.reasoning_content
                # 流式输出 reasoning_content（通过 additional_kwargs 传递给 CLI 显示）
                yield ChatGenerationChunk(
                    message=AIMessageChunk(
                        content="",
                        additional_kwargs={
                            "reasoning_content": delta.reasoning_content
                        },
                    )
                )

            # 流式输出 content
            if delta.content:
                yield ChatGenerationChunk(
                    message=AIMessageChunk(content=delta.content)
                )

            # 累积 tool_calls 碎片
            if hasattr(delta, "tool_calls") and delta.tool_calls:
                for tc_chunk in delta.tool_calls:
                    idx = tc_chunk.index
                    if idx not in tool_call_chunks:
                        tool_call_chunks[idx] = {
                            "id": "",
                            "name": "",
                            "arguments": "",
                        }
                    if tc_chunk.id:
                        tool_call_chunks[idx]["id"] = tc_chunk.id
                    if tc_chunk.function:
                        if tc_chunk.function.name:
                            tool_call_chunks[idx]["name"] = tc_chunk.function.name
                        if tc_chunk.function.arguments:
                            tool_call_chunks[idx][
                                "arguments"
                            ] += tc_chunk.function.arguments

            # 流结束：发出最后一个 chunk，携带完整的 tool_calls
            # 注意：reasoning_content 不在此处传递，因为流式阶段已逐片段 yield，
            # LangChain 的 AIMessageChunk.__add__ 会自动合并成完整值存入 additional_kwargs。
            # 如果在此处再传一次，CLI 的 on_chat_model_stream 会重复显示。
            if finish_reason:
                if full_reasoning:
                    print(
                        f"[DeepSeek-Reasoner] 保存 reasoning_content "
                        f"({len(full_reasoning)} 字符)"
                    )

                # 组装完整的 tool_calls
                tool_calls = []
                if tool_call_chunks:
                    for idx in sorted(tool_call_chunks.keys()):
                        tc = tool_call_chunks[idx]
                        try:
                            args = json.loads(tc["arguments"])
                        except (json.JSONDecodeError, TypeError):
                            args = {}
                        tool_calls.append(
                            {
                                "name": tc["name"],
                                "args": args,
                                "id": tc["id"],
                            }
                        )

                # 只在有 tool_calls 时发最后一个 chunk
                if tool_calls:
                    yield ChatGenerationChunk(
                        message=AIMessageChunk(
                            content="", tool_calls=tool_calls
                        )
                    )

    def bind_tools(
        self,
        tools: list,
        **kwargs: Any,
    ) -> "DeepSeekReasonerChatModel":
        """
        绑定工具到模型。

        返回同类型的新实例（而非 RunnableBinding），
        保证后续 with_retry() / ainvoke() 等调用链正常工作。
        支持 LangChain BaseTool 和 dict 格式的工具定义。
        """
        openai_tools = []
        for tool in tools:
            # 支持 dict 格式的工具定义（已经是 OpenAI 格式）
            if isinstance(tool, dict):
                openai_tools.append(tool)
                continue

            # LangChain BaseTool → OpenAI 格式
            tool_def = {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description or "",
                },
            }

            # 添加参数 schema
            if hasattr(tool, "args_schema") and tool.args_schema:
                tool_def["function"]["parameters"] = (
                    tool.args_schema.model_json_schema()
                )
            else:
                tool_def["function"]["parameters"] = {
                    "type": "object",
                    "properties": {},
                    "required": [],
                }

            openai_tools.append(tool_def)

        # 创建新实例，继承当前配置 + 绑定工具
        return self.__class__(
            api_key=self.api_key,
            base_url=self.base_url,
            model_name=self.model_name,
            temperature=self.temperature,
            timeout=self.timeout,
            max_tokens=self.max_tokens,
            bound_tools=openai_tools,
        )


# 方便导入
__all__ = ["DeepSeekReasonerChatModel"]
