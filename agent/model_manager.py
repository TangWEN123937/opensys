"""
动态模型切换管理器

参考 AI_JOIN 的 AgentConfigManager（tool_manager.py），以 model_name 为核心：
- 每个 model_name 在 config.MODEL_PRESETS 中有完整预设（provider、api_key、api_base、thinking_model、isvision）
- 同一 provider 下不同模型可以有不同的 api_base 和特性
- LRU 模型实例缓存池（避免重复创建，自动淘汰最久未用）
- 运行时动态切换：通过 AgentState.model_config 或 CLI /model 命令
- 工具绑定 + 重试策略统一管理
"""

import base64
import collections
import json
from io import BytesIO
from typing import Optional

from PIL import Image
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.rate_limiters import InMemoryRateLimiter

from . import config
from .tools import all_tools


# ==================== LRU 模型缓存池 ====================

# 缓存结构: {model_name: (base_llm, llm_with_tools_and_retry)}
_model_cache: collections.OrderedDict = collections.OrderedDict()
_MODEL_CACHE_MAX_SIZE = 10

# 共享限速器
_rate_limiter = InMemoryRateLimiter(
    requests_per_second=config.MAX_REQUESTS_PER_SECOND,
    check_every_n_seconds=config.RATE_LIMITER_CHECK_INTERVAL,
    max_bucket_size=config.RATE_LIMITER_BUCKET_SIZE,
)


# ==================== 核心函数 ====================

def resolve_model_config(model_name: Optional[str] = None) -> dict:
    """
    根据 model_name 解析完整的模型配置

    查找优先级：
    1. 精确匹配 MODEL_PRESETS[model_name]
    2. 未找到 → 返回默认模型配置 + 警告

    Args:
        model_name: 模型名称（如 'deepseek-chat', 'qwen3.5-plus', 'claude-sonnet-4-6'）

    Returns:
        完整配置 dict: {model_name, model_provider, api_key, api_base, thinking_model, isvision}
    """
    model_name = model_name or config.DEFAULT_MODEL_NAME

    # 精确匹配预设
    preset = config.MODEL_PRESETS.get(model_name)
    if preset:
        return preset.copy()

    # 未找到预设，回退到默认模型并警告
    print(f"⚠️ 模型 '{model_name}' 未在 MODEL_PRESETS 中配置，使用默认模型 '{config.DEFAULT_MODEL_NAME}'")
    default_preset = config.MODEL_PRESETS.get(config.DEFAULT_MODEL_NAME, {})
    return default_preset.copy() if default_preset else {
        "model_name": config.DEFAULT_MODEL_NAME,
        "model_provider": config.DEFAULT_MODEL_PROVIDER,
        "api_key": config.DEFAULT_API_KEY,
        "api_base": config.DEFAULT_API_BASE,
        "thinking_model": None,
        "isvision": None,
    }


def get_llm(model_name: Optional[str] = None) -> object:
    """
    获取 LLM 实例（带工具绑定 + 重试），支持 LRU 缓存

    以 model_name 为唯一入参，所有配置（provider、api_key、api_base 等）
    从 MODEL_PRESETS 自动获取。

    Args:
        model_name: 模型名称（必须是 MODEL_PRESETS 中的 key）

    Returns:
        绑定了工具 + 重试策略的 LLM 实例
    """
    model_name = model_name or config.DEFAULT_MODEL_NAME

    # 缓存命中
    if model_name in _model_cache:
        _model_cache.move_to_end(model_name)
        _, llm_ready = _model_cache[model_name]
        print(f"🤖 [缓存命中] 复用模型: {model_name}")
        return llm_ready

    # 从预设获取完整配置
    mc = resolve_model_config(model_name)
    print(f"🤖 [新建模型] {mc['model_name']} ({mc['model_provider']})")

    # 创建基础模型实例
    base_llm = _create_model_instance(mc)

    # 绑定工具 + 重试
    llm_with_tools = base_llm.bind_tools(all_tools)
    llm_ready = llm_with_tools.with_retry(
        stop_after_attempt=config.MAX_RETRY_ATTEMPTS,
        wait_exponential_jitter=True,
    )

    # 存入缓存（LRU 淘汰）
    _model_cache[model_name] = (base_llm, llm_ready)
    if len(_model_cache) > _MODEL_CACHE_MAX_SIZE:
        evicted_key, _ = _model_cache.popitem(last=False)
        print(f"🤖 [缓存淘汰] 移除最久未用: {evicted_key}")
    print(f"🤖 [缓存状态] 当前缓存数: {len(_model_cache)}")

    return llm_ready


def get_base_llm(model_name: Optional[str] = None) -> object:
    """
    获取不带工具绑定的基础 LLM（用于摘要等非工具场景）

    Args:
        model_name: 模型名称

    Returns:
        基础 LLM 实例（不带工具绑定）
    """
    model_name = model_name or config.DEFAULT_MODEL_NAME

    # 如果缓存中有，返回基础模型
    if model_name in _model_cache:
        _model_cache.move_to_end(model_name)
        base_llm, _ = _model_cache[model_name]
        return base_llm

    # 否则通过 get_llm 创建（会同时缓存），再取基础模型
    get_llm(model_name)
    if model_name in _model_cache:
        base_llm, _ = _model_cache[model_name]
        return base_llm

    # fallback: 直接创建
    mc = resolve_model_config(model_name)
    return _create_model_instance(mc)


def clear_cache():
    """清空模型缓存（用于测试或模型配置变更后）"""
    _model_cache.clear()
    print("🤖 [缓存清空] 所有模型实例已释放")


def list_cached_models() -> list[str]:
    """列出当前缓存的模型"""
    return list(_model_cache.keys())


def list_available_models() -> list[str]:
    """列出所有可用的预设模型名"""
    return list(config.MODEL_PRESETS.keys())


# ==================== 内部函数 ====================

def _create_model_instance(mc: dict) -> object:
    """
    根据完整配置创建模型实例（参考 AI_JOIN DynamicModelMiddleware._configure_model）

    Args:
        mc: 完整模型配置 dict（来自 MODEL_PRESETS 或 resolve_model_config）
    """
    model_name = mc["model_name"]
    provider = mc["model_provider"].lower()
    api_key = mc.get("api_key", "")
    api_base = mc.get("api_base", "")
    thinking_model = mc.get("thinking_model")
    temperature = config.DEFAULT_TEMPERATURE

    try:
        # --- DeepSeek ---
        if provider == "deepseek":
            from langchain_deepseek import ChatDeepSeek
            return ChatDeepSeek(
                model=model_name,
                api_key=api_key,
                **({"api_base": api_base} if api_base else {}),
                temperature=temperature,
                max_tokens=config.DEFAULT_MAX_TOKENS,
            )

        # --- Qwen / QwQ ---
        elif provider == "qwen":
            from langchain_qwq import ChatQwen
            enable_thinking = thinking_model if thinking_model is not None else False
            return ChatQwen(
                model_name=model_name,
                api_key=api_key,
                **({"api_base": api_base} if api_base else {}),
                enable_thinking=enable_thinking,
            )

        # --- Claude (Anthropic) ---
        elif provider == "anthropic":
            from langchain_anthropic import ChatAnthropic
            kwargs = {
                "model_name": model_name,
                "api_key": api_key,
                "temperature": temperature,
                "max_tokens": config.DEFAULT_MAX_TOKENS,
            }
            if api_base:
                kwargs["base_url"] = api_base
            return ChatAnthropic(**kwargs)

        # --- Gemini (Google) ---
        elif provider in ("google", "google_genai"):
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(
                model=model_name,
                api_key=api_key,
                **({"base_url": api_base} if api_base else {}),
                temperature=temperature,
            )

        # --- Ollama（本地模型） ---
        elif provider == "ollama":
            from langchain_ollama import ChatOllama
            return ChatOllama(
                model=model_name,
                **({"base_url": api_base} if api_base else {}),
                num_ctx=131072,
                temperature=temperature,
            )

        # --- 智谱 (GLM) ---
        elif provider == "zhipu":
            from langchain_community.chat_models import ChatZhipuAI
            return ChatZhipuAI(
                model=model_name,
                api_key=api_key,
            )

        # --- 通用 OpenAI 兼容 / 其他（fallback 到 init_chat_model） ---
        else:
            from langchain.chat_models import init_chat_model
            init_kwargs = dict(
                model=model_name,
                model_provider=provider,
                api_key=api_key,
                temperature=temperature,
                max_tokens=config.DEFAULT_MAX_TOKENS,
                rate_limiter=_rate_limiter,
            )
            if api_base:
                init_kwargs["base_url"] = api_base
            return init_chat_model(**init_kwargs)

    except Exception as e:
        print(f"❌ [模型创建] {model_name} ({provider}) 创建失败: {e}")
        print(f"   回退到 init_chat_model 通用接口...")
        from langchain.chat_models import init_chat_model
        init_kwargs = dict(
            model=model_name,
            model_provider=provider,
            api_key=api_key,
            temperature=temperature,
            max_tokens=config.DEFAULT_MAX_TOKENS,
            rate_limiter=_rate_limiter,
        )
        if api_base:
            init_kwargs["base_url"] = api_base
        return init_chat_model(**init_kwargs)


# ==================== 图片压缩（参考 AI_JOIN chatbot.compress_image_base64） ====================

def compress_image_base64(base64_str: str, max_size: int = 600, quality: int = 60) -> str:
    """
    压缩 base64 编码的图片（用于用户输入图片时的预处理）

    Args:
        base64_str: 纯 base64 编码字符串（不含 data:image/... 前缀）
        max_size: 最大尺寸（宽或高的最大值，默认 600px）
        quality: JPEG 压缩质量（1-100，默认 60）

    Returns:
        压缩后的 base64 字符串，失败时返回原图
    """
    try:
        # 解码 base64
        image_data = base64.b64decode(base64_str)
        img = Image.open(BytesIO(image_data))

        # 压缩尺寸
        if max(img.width, img.height) > max_size:
            ratio = max_size / max(img.width, img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        # 转换为 RGB（JPEG 不支持透明通道）
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")

        # 压缩质量并重新编码
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=quality, optimize=True)
        compressed_data = base64.b64encode(buffer.getvalue()).decode("utf-8")

        print(f"✅ [图片压缩] 原始: {len(base64_str)} -> 压缩后: {len(compressed_data)} "
              f"(压缩率: {len(compressed_data)/len(base64_str)*100:.1f}%)")
        return compressed_data
    except Exception as e:
        print(f"❌ [图片压缩] 压缩失败: {e}")
        return base64_str  # 压缩失败时返回原图


# ==================== 文本清理（移除无效 surrogate 字符） ====================
# sanitize_text 已移至 utils.py 以避免循环导入，此处保留向后兼容导出
from .utils import sanitize_text  # noqa: F401


# ==================== 消息清理（参考 AI_JOIN DynamicModelMiddleware._clean_messages） ====================

def clean_messages(messages: list, model_name: str = None) -> list:
    """
    清理消息列表：修复不完整工具调用序列 + 处理消息内容格式

    在 agent_node 每次调用 LLM 前执行，确保消息格式正确。

    两阶段处理：
    1. 修复不完整的工具调用序列（AIMessage 有 tool_calls 但缺少对应 ToolMessage）
    2. 根据模型 isvision 属性处理 content 格式：
       - 非视觉模型：将列表格式 content 转为纯文本
       - 视觉模型：保留原始格式，修复非法 content type

    Args:
        messages: 当前消息列表
        model_name: 当前模型名称（用于获取 isvision 配置）

    Returns:
        清理后的消息列表
    """
    model_name = model_name or config.DEFAULT_MODEL_NAME
    mc = resolve_model_config(model_name)
    isvision = mc.get("isvision", False)
    is_claude = "claude" in model_name.lower() if model_name else False

    print(f"[消息清理] 原始消息数: {len(messages)}, isvision={isvision}, model={model_name}")

    # --- 第一步：修复不完整的工具调用序列 ---
    # 收集所有已有 ToolMessage 的 tool_call_id
    tool_response_ids = set()
    for msg in messages:
        if isinstance(msg, ToolMessage) or (hasattr(msg, "tool_call_id") and getattr(msg, "tool_call_id", None)):
            tool_response_ids.add(msg.tool_call_id)

    # 为缺少 ToolMessage 的 tool_call 补占位响应（而不是删除 AIMessage，避免丢失内容）
    patch_messages = []
    patched_count = 0
    for msg in messages:
        patch_messages.append(msg)
        if isinstance(msg, AIMessage) and hasattr(msg, "tool_calls") and msg.tool_calls:
            for call in msg.tool_calls:
                cid = call.get("id") if isinstance(call, dict) else getattr(call, "id", None)
                if cid and cid not in tool_response_ids:
                    # 补一个占位 ToolMessage，让消息序列完整
                    tool_name = call.get("name") if isinstance(call, dict) else getattr(call, "name", "unknown")
                    patch_messages.append(ToolMessage(
                        content=f"[已执行] {tool_name}",
                        tool_call_id=cid,
                    ))
                    tool_response_ids.add(cid)  # 标记已补，避免重复
                    patched_count += 1

    cleaned_messages = patch_messages
    if patched_count:
        print(f"[消息清理] 补充 {patched_count} 条缺失的工具响应消息")

    # --- 第二步：处理消息内容格式 ---
    new_messages = []
    if not isvision:
        # 非视觉模式：将列表格式 content 转换为纯文本
        for message in cleaned_messages:
            if isinstance(message.content, list):
                # 保留带 tool_calls 的 AIMessage 不转换
                if isinstance(message, AIMessage) and hasattr(message, "tool_calls") and message.tool_calls:
                    new_messages.append(message)
                    continue
                # Claude 的 HumanMessage 保留列表格式
                if is_claude and isinstance(message, HumanMessage):
                    new_messages.append(message)
                    continue
                # 提取文本内容
                text_contents = []
                for content in message.content:
                    if isinstance(content, dict):
                        if content.get("type") == "text":
                            text_contents.append(content.get("text", ""))
                    elif isinstance(content, str):
                        text_contents.append(content)
                combined_text = " ".join(filter(None, text_contents)).strip()
                # 保留消息的元数据属性
                extra_kwargs = {}
                for attr in ("tool_call_id", "name", "id"):
                    val = getattr(message, attr, None)
                    if val is not None:
                        extra_kwargs[attr] = val
                if combined_text or extra_kwargs.get("tool_call_id"):
                    new_messages.append(message.__class__(
                        content=combined_text or "(空响应)",
                        **extra_kwargs
                    ))
            else:
                new_messages.append(message)
    else:
        # 视觉模式：保留原始消息格式，修复不合法的 content type
        VALID_CONTENT_TYPES = {"text", "image_url", "video_url", "video"}
        for message in cleaned_messages:
            if isinstance(message.content, list):
                # 保留带 tool_calls 的 AIMessage
                if isinstance(message, AIMessage) and hasattr(message, "tool_calls") and message.tool_calls:
                    new_messages.append(message)
                    continue
                # 检查是否包含非法 type
                has_invalid_type = any(
                    isinstance(c, dict) and c.get("type") not in VALID_CONTENT_TYPES
                    for c in message.content
                )
                if has_invalid_type:
                    # 将含非法 type 的列表 content 转为 JSON 文本
                    text_content = json.dumps(message.content, ensure_ascii=False)
                    print(f"[消息清理-视觉模式] 将含非法 type 的列表 content 转为 text (msg type: {type(message).__name__})")
                    extra_kwargs = {}
                    for attr in ("tool_call_id", "name", "id"):
                        val = getattr(message, attr, None)
                        if val is not None:
                            extra_kwargs[attr] = val
                    new_messages.append(message.__class__(
                        content=text_content,
                        **extra_kwargs
                    ))
                else:
                    new_messages.append(message)
            else:
                new_messages.append(message)

    print(f"[消息清理] 最终消息数: {len(new_messages)}")
    return new_messages


# ==================== Claude 缓存优化（参考 AI_JOIN DynamicModelMiddleware） ====================

def apply_claude_tool_cache(model_name: str, llm, tools: list):
    """
    为 Claude 模型的工具定义添加 cache_control（减少重复 token 消耗）

    Args:
        model_name: 模型名称
        llm: LLM 实例
        tools: 工具列表

    Returns:
        带缓存的 LLM 实例，失败时返回原始 llm
    """
    if not (model_name and "claude" in model_name.lower() and tools):
        return llm
    try:
        cached_llm = llm.bind_tools(
            tools,
            extra_tools=[{"cache_control": {"type": "ephemeral"}}],
        )
        print(f"[Claude缓存] 已为 {len(tools)} 个工具定义添加 cache_control")
        return cached_llm
    except Exception as e:
        print(f"[Claude缓存] 工具定义缓存绑定失败（忽略）: {e}")
        return llm


def apply_claude_message_cache(model_name: str, messages: list) -> None:
    """
    为 Claude 模型的消息列表添加 cache_control 断点（增量缓存策略）

    在倒数第 2 条和最后 1 条 HumanMessage 上打缓存断点，
    减少多轮对话中重复传输的 token 开销。

    Args:
        model_name: 模型名称
        messages: 消息列表（原地修改）
    """
    if not (model_name and "claude" in model_name.lower()):
        return

    # 清除所有消息中残留的 cache_control 标记
    for msg in messages:
        if isinstance(msg.content, list):
            for block in msg.content:
                if isinstance(block, dict):
                    block.pop("cache_control", None)

    # 收集 HumanMessage 索引，对倒数第 2 条和最后 1 条打断点
    human_indices = [i for i, msg in enumerate(messages) if isinstance(msg, HumanMessage)]
    indices_to_mark = set()
    if len(human_indices) >= 2:
        indices_to_mark.add(human_indices[-2])
    if len(human_indices) >= 1:
        indices_to_mark.add(human_indices[-1])

    for idx in indices_to_mark:
        msg = messages[idx]
        if isinstance(msg.content, str):
            msg.content = [{"type": "text", "text": msg.content, "cache_control": {"type": "ephemeral"}}]
        elif isinstance(msg.content, list) and len(msg.content) > 0:
            last_block = msg.content[-1]
            if isinstance(last_block, dict) and last_block.get("type") == "text":
                last_block["cache_control"] = {"type": "ephemeral"}

    print(f"[Claude缓存] 已为 {len(indices_to_mark)} 条 HumanMessage 添加 cache_control 断点")
