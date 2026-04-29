#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Chrome DevTools Recorder JSON → SKILL.md 草稿转换工具.

用法:
    python tools/recorder_to_skill.py <recording.json> [--name qq-mail] [--out data/skills/browser/qq-mail/SKILL.md]

输入:
    Chrome DevTools Recorder 导出的标准 JSON 文件
    (DevTools → Recorder → Export → JSON)

输出:
    符合 OpenSys 规范的 SKILL.md 草稿 (含 front matter + 操作步骤 + 空的规则表)
    需要人工再补充: triggers / key_rules / ⛔ 强制规则 / ⚠️ 常见错误
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

# ---------- 选择器处理 ----------

# Chrome Recorder selector 优先级排序（越靠前越稳定）
SELECTOR_PRIORITY = [
    ("data-testid", 100),  # [data-testid="xxx"]
    ("aria/", 90),         # aria/按钮文本
    ("#", 70),             # #id
    ("xpath/", 10),        # xpath 最兜底
    ("text/", 60),         # text/按钮文本
    ("[", 50),             # 属性选择器
    (".", 30),             # class（不稳定）
]


def _score_selector(selector: str) -> int:
    """根据选择器类型打分，分数越高越稳定."""
    s = selector.strip()
    # Chrome Recorder 特殊前缀
    if s.startswith("aria/"):
        return 90
    if s.startswith("text/"):
        return 60
    if s.startswith("xpath/"):
        return 10
    if s.startswith("pierce/"):
        return 40
    # CSS 选择器
    if "data-testid" in s or "data-test" in s:
        return 100
    if s.startswith("#") and " " not in s:
        return 70
    if "[aria-label" in s or "[name=" in s or "[placeholder" in s:
        return 80
    if s.startswith("[") or " [" in s:
        return 50
    if s.startswith(".") or " ." in s:
        return 30
    return 20


def _pick_best_selector(selectors: list) -> str:
    """从 selectors 备选列表中挑最稳定的一个.

    Chrome Recorder 的 selectors 是二维数组: [[main_sel_v1, main_sel_v2, ...], [iframe_sel, ...]]
    每个内层数组是一个 frame 的备选方案。
    """
    if not selectors:
        return ""
    # 只取主 frame (第一个)
    main_selectors = selectors[0] if isinstance(selectors[0], list) else [selectors[0]]
    if not main_selectors:
        return ""
    # 按稳定性评分排序
    ranked = sorted(main_selectors, key=_score_selector, reverse=True)
    return ranked[0]


def _humanize_selector(selector: str) -> str:
    """把选择器转成人类可读的描述."""
    s = selector.strip()
    if s.startswith("aria/"):
        return f"按钮「{s[5:]}」"
    if s.startswith("text/"):
        return f"文本「{s[5:]}」"
    m = re.match(r"\[aria-label=['\"]([^'\"]+)['\"]\]", s)
    if m:
        return f"「{m.group(1)}」"
    m = re.match(r"\[name=['\"]([^'\"]+)['\"]\]", s)
    if m:
        return f"字段「{m.group(1)}」"
    m = re.match(r"\[placeholder=['\"]([^'\"]+)['\"]\]", s)
    if m:
        return f"输入框「{m.group(1)}」"
    if s.startswith("#"):
        return f"元素 `{s}`"
    # 取最后一段
    return f"元素 `{s[:60]}{'...' if len(s) > 60 else ''}`"


# ---------- 敏感信息脱敏 ----------

SENSITIVE_PATTERNS = [
    # 密码 (当 type 暗示为密码字段时外层处理)
    # 身份证 18 位 (先匹配, 避免被手机号正则吃掉前 11 位) —— 用 (?<!\d) 避免误匹配更长数字串
    (re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)"), "<身份证>"),
    # 手机号 —— 同样用数字负向环视, 而非 \b (中文字符与数字间无 \b)
    (re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"), "<手机号>"),
    # 邮箱: 保留域名, 替换用户名
    (re.compile(r"([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})"),
     lambda m: f"<邮箱>@{m.group(2)}"),
]


def _mask_value(value: str, selector: str = "") -> tuple[str, bool]:
    """对输入值做脱敏, 返回 (脱敏后的值, 是否被脱敏)."""
    if not value:
        return value, False
    # 密码字段整体遮盖
    if "password" in selector.lower() or "pwd" in selector.lower():
        return "<PASSWORD>", True
    masked = value
    changed = False
    for pat, repl in SENSITIVE_PATTERNS:
        new = pat.sub(repl, masked)
        if new != masked:
            changed = True
            masked = new
    return masked, changed


# ---------- 核心转换逻辑 ----------

def _format_step(idx: int, step: dict, prev_ts: int | None = None) -> str | None:
    """把单个 Recorder step 转成 Markdown 行. 返回 None 表示跳过."""
    stype = step.get("type", "")

    if stype == "setViewport":
        return None  # 视口设置无需体现

    if stype == "navigate":
        url = step.get("url", "")
        return f"打开 `{url}`"

    if stype == "click":
        sel = _pick_best_selector(step.get("selectors", []))
        desc = _humanize_selector(sel) if sel else "目标元素"
        return f"点击 {desc}  \n   选择器: `{sel}`"

    if stype == "doubleClick":
        sel = _pick_best_selector(step.get("selectors", []))
        return f"双击 {_humanize_selector(sel)}  \n   选择器: `{sel}`"

    if stype == "change":
        sel = _pick_best_selector(step.get("selectors", []))
        raw_value = step.get("value", "")
        value, masked = _mask_value(raw_value, sel)
        marker = " **(已脱敏)**" if masked else ""
        return (f"在 {_humanize_selector(sel)} 输入: `{value}`{marker}  \n"
                f"   选择器: `{sel}`")

    if stype == "keyDown":
        key = step.get("key", "")
        # 只记录有意义的功能键
        if key in ("Enter", "Tab", "Escape", "ArrowDown", "ArrowUp"):
            return f"按下 **{key}** 键"
        return None

    if stype == "keyUp":
        return None  # keyDown 已经记录，keyUp 忽略

    if stype == "scroll":
        y = step.get("y", 0)
        return f"滚动到 y={y}"

    if stype == "waitForElement":
        sels = step.get("selectors", [])
        sel = _pick_best_selector(sels) if sels else ""
        vis = step.get("visible", True)
        return f"等待 {_humanize_selector(sel)} {'出现' if vis else '消失'}"

    if stype == "waitForExpression":
        expr = step.get("expression", "")
        return f"等待条件: `{expr[:80]}`"

    if stype == "emulateNetworkConditions":
        return None

    if stype == "customStep":
        name = step.get("name", "")
        return f"自定义步骤: {name}"

    # 未知类型保留原始信息
    return f"[未识别步骤 `{stype}`] {json.dumps(step, ensure_ascii=False)[:120]}"


def _dedupe_keydown(steps: list[dict]) -> list[dict]:
    """合并连续输入: 一个 change 后紧跟的同元素 keyDown(非功能键)可省略."""
    result: list[dict] = []
    for s in steps:
        # 去掉普通字符 keyDown（change 事件已经记录最终值）
        if s.get("type") == "keyDown" and len(s.get("key", "")) == 1:
            continue
        result.append(s)
    return result


def _extract_url_prefixes(steps: list[dict]) -> list[str]:
    """从所有 navigate 步骤提取 URL 前缀 (scheme+host)."""
    prefixes: set[str] = set()
    for s in steps:
        if s.get("type") == "navigate":
            url = s.get("url", "")
            parsed = urlparse(url)
            if parsed.scheme and parsed.netloc:
                prefixes.add(f"{parsed.scheme}://{parsed.netloc}")
    return sorted(prefixes)


def convert(recording: dict, skill_name: str) -> str:
    """生成 SKILL.md 内容."""
    title = recording.get("title", skill_name)
    raw_steps = recording.get("steps", [])
    steps = _dedupe_keydown(raw_steps)

    url_prefixes = _extract_url_prefixes(steps)
    primary_url = url_prefixes[0] if url_prefixes else ""

    # 操作步骤 markdown
    body_lines: list[str] = []
    step_num = 0
    for s in steps:
        line = _format_step(step_num + 1, s)
        if line is None:
            continue
        step_num += 1
        body_lines.append(f"{step_num}. {line}")
    body_md = "\n".join(body_lines) if body_lines else "_(无步骤)_"

    # front matter
    prefixes_yaml = "[" + ", ".join(url_prefixes) + "]" if url_prefixes else "[]"

    skill_md = f"""---
name: {title}
triggers: []  # TODO: 填写触发关键词, 如 [QQ邮箱, mail.qq, 发邮件]
priority: 5
description: {title} 的操作规范 (由 Chrome Recorder 自动生成草稿)
summary: TODO - 用 2-3 句概括核心操作步骤、产出物、适用场景
key_rules: TODO - 填写关键约束 (分号分隔), 如"禁止用evaluate填表单; 输入后必须按Enter确认"
target_role: browser
url_prefixes: {prefixes_yaml}
version: "0.1-draft"
---

> ⚠️ **本文件为自动生成草稿**, 仅包含录制到的机械步骤。
> 请人工审核并补充: `triggers` / `key_rules` / ⛔强制规则 / ⚠️常见错误 / 边界情况处理。

## ⛔ 强制规则

| 编号 | 规则 | 必须 | 禁止 |
|------|------|------|------|
| R1 | _(待填写)_ | | |

## ⚠️ 常见错误

| ❌ 错误做法 | ✅ 正确做法 | 规则 |
|------------|-----------|------|
| _(待填写)_ | | |

## 📋 操作步骤 (录制原始轨迹)

**目标网址**: {primary_url or '_(未录制到 navigate 事件)_'}

{body_md}

## 🧪 元数据

- 录制总步数 (原始): {len(raw_steps)}
- 降噪后步数: {len(steps)}
- 识别到的 URL 前缀: {len(url_prefixes)}
"""
    return skill_md


# ---------- CLI ----------

def main() -> int:
    parser = argparse.ArgumentParser(description="Chrome Recorder JSON → SKILL.md 转换器")
    parser.add_argument("input", type=Path, help="Chrome DevTools Recorder 导出的 JSON 文件")
    parser.add_argument("--name", default=None, help="Skill 名称 (默认取 JSON 的 title)")
    parser.add_argument("--out", type=Path, default=None,
                        help="输出路径 (默认 ./<name>.SKILL.md)")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"[错误] 输入文件不存在: {args.input}", file=sys.stderr)
        return 1

    try:
        recording = json.loads(args.input.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"[错误] JSON 解析失败: {e}", file=sys.stderr)
        return 1

    skill_name = args.name or recording.get("title", args.input.stem)
    md = convert(recording, skill_name)

    out_path = args.out or Path(f"{skill_name}.SKILL.md")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(md, encoding="utf-8")
    print(f"[成功] 已生成草稿: {out_path}")
    print(f"       步骤数: 原始 {len(recording.get('steps', []))} → 降噪后 {md.count(chr(10) + '1. ') and md.count('. ')} 行")
    print("       下一步: 人工审核, 补充 triggers / key_rules / 强制规则。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
