"""
OpenSys 任务分类器

功能：
1. 任务复杂度分级（simple/standard/complex）— 纯关键词规则，零 LLM 调用
2. 多阶段任务检测（needs_planning）— Advisor 触发兜底，防止 LLM 跳过规划

分级逻辑：
1. 优先检测 complex 特征（架构、重构、多模块等高复杂度关键词）
2. 再检测 simple 特征（查看、版本、帮助等只读/信息查询关键词）
3. 兜底为 standard（修复、创建、编写等常规开发任务）
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


# ==================== 多阶段任务检测（Advisor 触发兜底） ====================

# 需要规划的多阶段任务特征（同时出现两类关键词才触发）
# 类型 A：信息采集动作
_PLANNING_COLLECT_KEYWORDS = [
    "搜索", "查询", "获取", "采集", "爬取", "抓取", "提取", "收集",
    "调研", "研究", "对比", "搜", "查",
    "search", "crawl", "scrape", "extract", "collect", "research",
]

# 类型 B：产出/分析动作
_PLANNING_OUTPUT_KEYWORDS = [
    "报告", "总结", "分析", "统计", "汇总", "整理", "对比分析",
    "写一篇", "形成", "输出", "撰写", "生成报告",
    "推荐", "方案", "建议", "评估",
    "report", "summary", "analyze", "statistics", "recommend",
]

# 类型 C：需要浏览器操作的关键词（单独命中即需规划，因为浏览器操作必须通过 pipeline 编排）
_PLANNING_BROWSER_KEYWORDS = [
    "登录", "注册", "填写", "点击", "浏览器", "操作页面",
    "抖音", "算数指数", "创作者平台", "后台",
    "login", "sign in", "sign up", "browser",
]


def needs_planning(user_message: str) -> tuple[bool, str]:
    """
    检测用户消息是否涉及多阶段任务（需要 Advisor 规划）

    判定规则：
    1. 包含浏览器操作关键词 → 直接触发（浏览器操作必须通过 pipeline 编排）
    2. 同时包含"信息采集"和"产出/分析"两类关键词 → 触发

    Args:
        user_message: 用户最新输入文本

    Returns:
        (should_plan, reason):
        - should_plan: True 表示需要规划
        - reason: 触发原因描述（用于日志）
    """
    if not user_message:
        return False, ""

    text = user_message.lower()

    # 规则 1：浏览器操作关键词 → 直接触发（浏览器已独立为子代理节点）
    browser_hits = [kw for kw in _PLANNING_BROWSER_KEYWORDS if kw.lower() in text]
    if browser_hits:
        reason = f"浏览器操作({','.join(browser_hits[:2])})"
        return True, reason

    # 规则 2：采集 + 产出 同时命中 → 触发
    collect_hits = [kw for kw in _PLANNING_COLLECT_KEYWORDS if kw.lower() in text]
    output_hits = [kw for kw in _PLANNING_OUTPUT_KEYWORDS if kw.lower() in text]

    if collect_hits and output_hits:
        reason = f"采集({','.join(collect_hits[:2])}) + 产出({','.join(output_hits[:2])})"
        return True, reason

    return False, ""

