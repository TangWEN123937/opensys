"""
OpenSys 任务复杂度分级器

根据用户输入的文本自动判断任务复杂度（simple/standard/complex），
用于在 system prompt 中注入模型推荐建议（仅推荐，不自动切换）。

分级逻辑：
1. 优先检测 complex 特征（架构、重构、多模块等高复杂度关键词）
2. 再检测 simple 特征（查看、版本、帮助等只读/信息查询关键词）
3. 兜底为 standard（修复、创建、编写等常规开发任务）

设计要点：
- 纯关键词 + 句法规则，零 LLM 调用，零延迟
- 返回复杂度等级 + 匹配到的特征关键词（用于日志和 prompt 展示）
- 可通过 config.MODEL_RECOMMENDATIONS 映射到推荐模型
"""

import re
from typing import Literal

from . import config


# ==================== 复杂度特征关键词 ====================

# complex：架构级别任务，需要全局理解和设计能力
COMPLEX_KEYWORDS = [
    # 架构设计
    "架构", "设计模式", "系统设计", "技术方案", "重构", "重写",
    "refactor", "redesign", "architecture", "migration",
    # 多模块协调
    "集成", "迁移", "全面改造", "跨模块", "端到端",
    "integration", "migrate", "end-to-end",
    # 高复杂度标志
    "性能优化", "并发", "分布式", "微服务", "安全审计",
    "数据库设计", "API 设计", "接口设计",
    "从零搭建", "从头开始", "全新项目",
]

# simple：信息查询、只读操作、单步任务
SIMPLE_KEYWORDS = [
    # 信息查询
    "查看", "显示", "列出", "列举", "告诉我", "什么是", "解释",
    "show", "list", "display", "what is", "explain",
    # 版本和状态
    "版本", "状态", "帮助", "help", "version", "status",
    # 简单操作
    "打印", "输出", "读取", "看看", "检查一下",
    "print", "read", "check",
]

# 复合特征：多个中等复杂度信号同时出现时升级为 complex
MULTI_FILE_PATTERNS = [
    r"多个文件", r"所有文件", r"批量", r"全部.*修改",
    r"multiple files", r"all files", r"batch",
]

STANDARD_KEYWORDS = [
    # 常规开发
    "修复", "修改", "添加", "创建", "编写", "实现", "开发",
    "fix", "modify", "add", "create", "write", "implement", "develop",
    # 调试
    "调试", "debug", "错误", "error", "bug",
    # 配置
    "配置", "安装", "部署", "setup", "install", "deploy", "config",
]


# ==================== 核心分级函数 ====================

def classify_task_complexity(
    user_message: str,
) -> tuple[Literal["simple", "standard", "complex"], list[str]]:
    """
    根据用户输入判断任务复杂度

    分级规则（优先级从高到低）：
    1. complex: 包含架构/重构/集成等高复杂度关键词
    2. simple: 包含查看/版本/帮助等只读关键词，且不含 standard 关键词
    3. standard: 兜底（包含开发类关键词，或无法明确分类）

    Args:
        user_message: 用户最新输入文本

    Returns:
        (complexity, matched_keywords):
        - complexity: "simple" | "standard" | "complex"
        - matched_keywords: 匹配到的特征关键词列表（用于日志）
    """
    if not user_message:
        return "standard", []

    text = user_message.lower()
    matched = []

    # --- 第一优先级：检测 complex 特征 ---
    for kw in COMPLEX_KEYWORDS:
        if kw.lower() in text:
            matched.append(kw)
    if matched:
        return "complex", matched

    # --- 检测多文件/批量操作模式（升级为 complex）---
    for pattern in MULTI_FILE_PATTERNS:
        if re.search(pattern, text):
            matched.append(f"pattern:{pattern}")
    if matched:
        return "complex", matched

    # --- 第二优先级：检测 simple 特征 ---
    simple_matched = []
    for kw in SIMPLE_KEYWORDS:
        if kw.lower() in text:
            simple_matched.append(kw)

    # simple 判定：有 simple 关键词 且 没有 standard 关键词
    if simple_matched:
        has_standard = any(kw.lower() in text for kw in STANDARD_KEYWORDS)
        if not has_standard:
            return "simple", simple_matched

    # --- 兜底：standard ---
    standard_matched = []
    for kw in STANDARD_KEYWORDS:
        if kw.lower() in text:
            standard_matched.append(kw)

    return "standard", standard_matched


# ==================== 模型推荐函数 ====================

def get_model_recommendation(
    complexity: Literal["simple", "standard", "complex"],
    current_model: str = None,
) -> dict | None:
    """
    根据复杂度等级获取模型推荐信息

    如果当前模型已经匹配推荐等级，返回 None（不需要推荐）。

    Args:
        complexity: 任务复杂度等级
        current_model: 当前正在使用的模型名称

    Returns:
        推荐信息 dict，或 None（不需要推荐）
        {
            "recommended_model": str,  # 推荐的模型名
            "complexity": str,         # 复杂度等级
            "reason": str,             # 推荐原因
        }
    """
    recommendations = getattr(config, "MODEL_RECOMMENDATIONS", None)
    if not recommendations:
        return None

    recommended = recommendations.get(complexity)
    if not recommended:
        return None

    # 当前模型已经是推荐模型，不需要再推荐
    current = current_model or config.DEFAULT_MODEL_NAME
    if current == recommended:
        return None

    # 生成推荐原因
    reason_map = {
        "simple": "当前任务较简单，推荐使用快速模型节省成本",
        "standard": "当前任务为常规开发，推荐使用标准模型",
        "complex": "当前任务复杂度较高，推荐使用最强模型获得更好效果",
    }

    return {
        "recommended_model": recommended,
        "complexity": complexity,
        "reason": reason_map.get(complexity, ""),
    }


# ==================== 格式化 prompt 注入 ====================

def format_recommendation_for_prompt(
    user_message: str,
    current_model: str = None,
) -> str:
    """
    一站式接口：分级 → 推荐 → 格式化为 prompt 注入文本

    在 graph.py 的 _build_system_prompt() 中调用。

    Args:
        user_message: 用户最新输入
        current_model: 当前使用的模型名

    Returns:
        格式化后的推荐文本（直接拼接到 system prompt），
        无推荐时返回空字符串
    """
    if not user_message:
        return ""

    complexity, keywords = classify_task_complexity(user_message)
    recommendation = get_model_recommendation(complexity, current_model)

    if not recommendation:
        return ""

    model = recommendation["recommended_model"]
    reason = recommendation["reason"]

    return (
        f"\n\n> 💡 **[系统建议]** {reason}，"
        f"建议使用 `/model {model}`。"
        f"（当前复杂度: {complexity}，当前模型: {current_model or config.DEFAULT_MODEL_NAME}）"
    )
