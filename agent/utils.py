"""
OpenSys 通用工具函数

放置不依赖其他 agent 子模块的工具函数，避免循环导入。
"""


def ensure_str_content(content) -> str:
    """
    将消息 content 统一转为 str。

    Anthropic API 返回的 content 是 list 格式（如 [{'type': 'text', 'text': '...'}]），
    而其他提供商（OpenAI/DeepSeek/Qwen 等）返回 str。此函数统一处理两种格式。

    Args:
        content: str 或 list[dict]（Anthropic content_block 格式）

    Returns:
        纯文本字符串
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # 提取所有 text 类型块的文本内容
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif "text" in block:
                    parts.append(block["text"])
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return str(content) if content else ""


def strip_text_tool_calls(content: str) -> str:
    """
    清理 LLM 响应中残留的 <tool_call>...</tool_call> 纯文本标签。

    当 API 代理或模型异常时，工具调用可能同时出现在结构化 tool_calls 和纯文本 content 中。
    结构化 tool_calls 由 LangGraph 正常处理，content 中的文本标签是冗余的，需要剥离。

    Args:
        content: AIMessage 的文本内容

    Returns:
        清理后的文本（移除 <tool_call> 标签及其 JSON 内容）
    """
    if not isinstance(content, str) or "<tool_call>" not in content:
        return content
    import re
    # 移除 <tool_call>...</tool_call> 和 <tool_call>...（无闭合标签）
    cleaned = re.sub(r"<tool_call>.*?</tool_call>", "", content, flags=re.DOTALL)
    cleaned = re.sub(r"<tool_call>\{.*", "", cleaned, flags=re.DOTALL)
    # 清理多余空行
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def sanitize_text(text: str) -> str:
    """
    清理文本中的无效 Unicode surrogate 字符（\\ud800-\\udfff）。
    这些字符会导致 'utf-8' codec can't encode: surrogates not allowed 错误。

    处理逻辑：
    1. 用正则移除所有未配对的 surrogate 字符（\\ud800-\\udfff）
    2. 再用 encode/decode 兜底清理残余无效序列
    """
    if not isinstance(text, str):
        return text
    import re
    # 第一步：正则移除 surrogate 字符（中文退格残留的半字节会产生这类字符）
    text = re.sub(r'[\ud800-\udfff]', '', text)
    # 第二步：兜底 — encode+decode 清理残余无效序列
    return text.encode("utf-8", errors="surrogatepass").decode("utf-8", errors="replace")
