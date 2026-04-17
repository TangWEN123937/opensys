"""
OpenSys 轻量 Web 工具

提供 API 级别的网络访问能力：
  - Tavily search：关键词搜索，返回摘要 + URL（轻量、快速）
  - Tavily extract：指定 URL 提取正文内容（轻量、快速）

注意：浏览器交互操作已迁移至独立的 Browser 子代理节点
（agent/subagents/browser.py），由 pipeline_router 直接调度。
"""

import asyncio
import json
from typing import Optional
from pydantic import BaseModel, Field
from langchain_core.tools import tool
from tavily import AsyncTavilyClient

from .. import config


# ==================== 输入参数定义 ====================

class WebToolInput(BaseModel):
    """web_tool 输入参数"""
    task: str = Field(
        description="具体任务描述，如 '搜索 GStack 的架构特点' 或 '提取某网页内容'"
    )
    context: str = Field(
        default="",
        description="任务背景摘要（为什么需要这些信息），帮助更精准地搜索和提取"
    )
    url: str = Field(
        default="",
        description="可选，指定目标 URL。提供时优先提取该页面内容"
    )
    mode: str = Field(
        default="auto",
        description="执行模式：auto（推荐，自动判断）| search（强制搜索）| extract（强制提取）"
    )


# ==================== 路由逻辑 ====================

def _route(task: str, url: str, mode: str) -> str:
    """
    路由决策：返回 'search' | 'extract'

    优先级：
    1. mode 强制指定 → 直接走
    2. 有 URL → extract
    3. 默认 → search
    """
    # 1. 强制模式
    if mode in ("search", "extract"):
        return mode

    # 2. 有明确 URL → 轻量提取
    if url:
        return "extract"

    # 3. 默认：轻量搜索
    return "search"


# ==================== Tavily 轻量层 ====================

async def _tavily_search(query: str, context: str = "") -> str:
    """Tavily 关键词搜索，返回格式化结果"""
    api_key = config.TAVILY_API_KEY
    if not api_key:
        return "❌ 搜索失败：未配置 TAVILY_API_KEY 环境变量"

    client = AsyncTavilyClient(api_key=api_key)

    # 如果有上下文，拼接到查询中提升相关性
    search_query = f"{query} ({context})" if context else query

    results = await client.search(
        query=search_query,
        max_results=config.WEB_SEARCH_MAX_RESULTS,
        topic="general",
        include_answer=True,
    )

    return _format_search_results(results)


async def _tavily_extract(urls: str | list[str]) -> str:
    """Tavily URL 提取，返回页面正文内容"""
    api_key = config.TAVILY_API_KEY
    if not api_key:
        return "❌ 提取失败：未配置 TAVILY_API_KEY 环境变量"

    # 确保 urls 是列表
    if isinstance(urls, str):
        urls = [urls]

    client = AsyncTavilyClient(api_key=api_key)
    results = await client.extract(
        urls=urls,
        include_images=False,
    )

    return _format_extract_results(results)



# ==================== 格式化输出 ====================

def _format_search_results(results: dict) -> str:
    """将 Tavily 搜索结果格式化为 LLM 友好的文本"""
    lines = []

    # AI 生成的直接回答
    answer = results.get("answer")
    if answer:
        lines.append(f"📋 **综合回答**：\n{answer}\n")

    # 搜索结果列表
    search_results = results.get("results", [])
    if search_results:
        lines.append(f"🔍 **搜索结果**（共 {len(search_results)} 条）：\n")
        for i, r in enumerate(search_results, 1):
            title = r.get("title", "无标题")
            url = r.get("url", "")
            content = r.get("content", "")
            # 截断过长的摘要
            if len(content) > 500:
                content = content[:500] + "..."
            lines.append(f"**{i}. {title}**")
            lines.append(f"   URL: {url}")
            lines.append(f"   摘要: {content}\n")

    if not lines:
        return "未找到相关搜索结果。"

    return "\n".join(lines)


def _format_extract_results(results: dict) -> str:
    """将 Tavily 提取结果格式化为 LLM 友好的文本"""
    lines = []

    extracted = results.get("results", [])
    if extracted:
        for i, r in enumerate(extracted, 1):
            url = r.get("url", "")
            content = r.get("raw_content", "")
            # 截断过长的内容（防止 token 爆炸）
            if len(content) > 5000:
                content = content[:5000] + "\n\n... [内容过长已截断，共 " + str(len(r.get("raw_content", ""))) + " 字符]"
            lines.append(f"📄 **页面 {i}**: {url}\n")
            lines.append(f"{content}\n")

    # 失败的 URL
    failed = results.get("failed_results", [])
    if failed:
        for f_item in failed:
            url = f_item.get("url", "")
            error = f_item.get("error", "未知错误")
            lines.append(f"❌ 提取失败: {url} — {error}")

    if not lines:
        return "未能提取到页面内容。"

    return "\n".join(lines)


# ==================== 统一工具入口 ====================

@tool(args_schema=WebToolInput)
async def web_tool(
    task: str,
    context: str = "",
    url: str = "",
    mode: str = "auto",
) -> str:
    """网络工具：搜索信息或提取网页内容（API 级别，轻量快速）。

    内部自动选择最优方式执行：
    - 普通搜索 → 搜索引擎 API（快速，<1秒）
    - 读取网页内容 → 网页提取 API（快速，提供 url 参数即可）

    注意：需要浏览器交互的复杂操作（登录、填表、JS 动态页面等）
    请使用 request_planning 工具请求 Advisor 规划，由浏览器子代理执行。

    参数:
        task: 具体任务描述（尽量详细，说清楚要做什么、要什么结果）
        context: 任务背景摘要（为什么需要这些信息，便于更精准地搜索和提取）
        url: 可选，指定目标网页 URL
        mode: auto（推荐，自动判断）| search（强制搜索）| extract（强制提取 url 内容）
    """
    try:
        # 路由决策
        route = _route(task, url, mode)
        print(f"[Web工具] 路由决策: {route} | task={task[:50]}... | url={url[:50] if url else '无'}")

        if route == "search":
            return await _tavily_search(task, context)

        elif route == "extract":
            if not url:
                return "❌ 提取模式需要提供 url 参数"
            return await _tavily_extract(url)

        else:
            return f"❌ 未知模式: {mode}"

    except Exception as e:
        error_msg = f"❌ Web 工具执行失败: {str(e)}"
        print(f"[Web工具] 异常: {e}")
        return error_msg
