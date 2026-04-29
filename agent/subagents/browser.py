"""
OpenSys Browser 浏览器子代理节点

Browser 是独立的子代理节点，直接由 pipeline_router 调度（method=browser），
不再经过主 Agent 中转，消除"传话筒"层级。

核心职责：
1. 从 pipeline phase 获取浏览器任务描述
2. 按 URL 前缀匹配浏览器技能（Skill）注入
3. 直接驱动 Browser-Use Agent 执行浏览器操作
4. 返回结构化的操作结果，供 Reviewer 审查

与旧架构的区别：
- 旧：Agent → web_tool(browse) → Browser-Use Agent（三层嵌套）
- 新：pipeline_router → browser_node → Browser-Use Agent（两层，去掉中间传话筒）

上下文分配：
- ✅ phase description（任务描述）
- ✅ phase url（目标网址，Advisor 规划时必须提供）
- ✅ phase details（操作细节：收件人、内容、数据字段等）
- ✅ browser skill（按 URL 匹配的操作指南 SOP）
- ✅ advisor_context.user_request（用户原始需求）
- ✅ 前序阶段产出物（Phase 1 确认的细节信息）
- ✅ rework 反馈（审查不通过时的修改意见）
- ❌ 完整对话历史
- ❌ memory
"""

import asyncio
import os
import time
import traceback
from pathlib import Path

from langchain_core.messages import AIMessage

from .. import config
from ..event_bus import publish as publish_event
from ..skill_loader import match_browser_skills, load_skill_script
from ..pipeline_logger import log_browser_event


# ==================== Browser-Use LLM 创建 ====================

def _patch_json_object_format(llm_instance):
    """
    包装 ChatOpenAI 实例，让 dont_force_structured_output=True 分支
    自动注入 response_format={"type": "json_object"}。

    browser-use 的 ChatOpenAI 在 dont_force_structured_output=True 时
    完全不发 response_format，但 DashScope 等 API 支持 json_object 模式，
    可以保证输出是合法 JSON（虽然不强制 schema 结构）。
    配合 add_schema_to_system_prompt 注入的 schema，双重保障输出质量。

    实现原理：
    - 保存原始 get_client 方法
    - 返回代理 client，其 chat.completions.create 在没有 response_format 时
      自动注入 {"type": "json_object"}
    """
    import functools

    original_get_client = llm_instance.get_client

    @functools.wraps(original_get_client)
    def patched_get_client():
        client = original_get_client()
        original_create = client.chat.completions.create

        @functools.wraps(original_create)
        async def patched_create(*args, **kwargs):
            # 仅在没有 response_format 时注入 json_object
            if "response_format" not in kwargs:
                kwargs["response_format"] = {"type": "json_object"}
            return await original_create(*args, **kwargs)

        client.chat.completions.create = patched_create
        return client

    llm_instance.get_client = patched_get_client
    return llm_instance


def _create_browser_llm():
    """
    根据 config.BROWSER_MODEL_NAME 创建 Browser-Use 兼容的 LLM 实例

    Browser-Use 使用自己的 LLM 封装（非 LangChain），需从 MODEL_PRESETS 读取
    配置后用 Browser-Use 对应的 Chat 类创建实例。

    支持的 provider 映射：
    - deepseek → browser_use.llm.deepseek.chat.ChatDeepSeek
    - anthropic → browser_use.llm.anthropic.chat.ChatAnthropic
    - google/google_genai → browser_use.llm.google.chat.ChatGoogle
    - ollama → browser_use.llm.ollama.chat.ChatOllama
    - openai 及其他 → browser_use.llm.openai.chat.ChatOpenAI（兜底）
    """
    model_name = config.BROWSER_MODEL_NAME
    preset = config.MODEL_PRESETS.get(model_name)
    if not preset:
        # 未找到预设，回退默认模型
        print(f"[Browser-LLM] 预设 '{model_name}' 未找到，回退到 '{config.DEFAULT_MODEL_NAME}'")
        preset = config.MODEL_PRESETS.get(config.DEFAULT_MODEL_NAME, {})
        model_name = preset.get("model_name", config.DEFAULT_MODEL_NAME)

    provider = preset.get("model_provider", "openai").lower()
    api_key = preset.get("api_key", "")
    api_base = preset.get("api_base", "")
    actual_model = preset.get("model_name", model_name)

    # === 视觉能力校验：Browser-Use 需要 LLM 能处理页面截图 ===
    is_vision = preset.get("isvision")
    if not is_vision:
        # 收集可用的视觉模型列表，给出具体建议
        vision_models = [
            name for name, p in config.MODEL_PRESETS.items()
            if p.get("isvision")
        ]
        print(
            f"[Browser-LLM] ⚠️ 警告: '{actual_model}' 不支持视觉(isvision={is_vision})！\n"
            f"  Browser-Use 需要视觉模型才能看到页面截图，当前模型可能无法正确操作浏览器。\n"
            f"  推荐在 .env 中设置 OPENSYS_BROWSER_MODEL 为以下支持视觉的模型之一：\n"
            f"  {', '.join(vision_models)}"
        )

    print(f"[Browser-LLM] 创建浏览器 LLM: {actual_model} ({provider}, vision={is_vision})")

    try:
        if provider == "deepseek":
            # DeepSeek 推理模型（thinking_model=True，如 deepseek-v4-flash）不支持 tool_choice 参数，
            # 而 browser_use.llm.deepseek.chat.ChatDeepSeek 在 structured output 路径会传 tool_choice，
            # 导致 API 返回 400: "deepseek-reasoner does not support this tool_choice"。
            # 解决：推理模型走 OpenAI 兼容路径，schema 注入 prompt 而非强制 tool_choice。
            is_thinking = preset.get("thinking_model", False)
            if is_thinking:
                from browser_use.llm.openai.chat import ChatOpenAI as BrowserChatOpenAI
                llm = BrowserChatOpenAI(
                    model=actual_model,
                    api_key=api_key,
                    base_url=api_base or "https://api.deepseek.com/v1",
                    add_schema_to_system_prompt=True,       # schema 注入 prompt 引导输出
                    dont_force_structured_output=True,      # 不使用 tool_choice / json_schema
                    remove_min_items_from_schema=True,      # 兼容性
                )
                llm = _patch_json_object_format(llm)
                print(f"[Browser-LLM] DeepSeek 推理模型 → OpenAI 兼容模式（绕过 tool_choice）")
                return llm
            else:
                from browser_use.llm.deepseek.chat import ChatDeepSeek
                return ChatDeepSeek(
                    model=actual_model,
                    api_key=api_key,
                    **({"base_url": api_base} if api_base else {}),
                )
        elif provider == "anthropic":
            from browser_use.llm.anthropic.chat import ChatAnthropic
            return ChatAnthropic(
                model=actual_model,
                api_key=api_key,
            )
        elif provider in ("google", "google_genai"):
            from browser_use.llm.google.chat import ChatGoogle
            return ChatGoogle(
                model=actual_model,
                api_key=api_key,
            )
        elif provider == "ollama":
            from browser_use.llm.ollama.chat import ChatOllama
            return ChatOllama(
                model=actual_model,
                **({"base_url": api_base} if api_base else {}),
            )
        else:
            # OpenAI 兼容接口兜底（含 qwen/kimi/minimax 等走 dashscope 的模型）
            from browser_use.llm.openai.chat import ChatOpenAI
            # 非原生 OpenAI 模型：大多数第三方 API 不完整支持 response_format json_schema strict 模式
            # 导致嵌套结构被简化（如 {"click": 12604} 而非 {"click": {"index": 12604}}）
            # 解决：把 JSON schema 注入 system prompt 引导模型，不强制 API 级别的 structured output
            is_native_openai = provider == "openai"
            llm = ChatOpenAI(
                model=actual_model,
                api_key=api_key,
                add_schema_to_system_prompt=not is_native_openai,     # 非原生 OpenAI → schema 注入 prompt
                dont_force_structured_output=not is_native_openai,    # 非原生 OpenAI → 不强制 json_schema
                remove_min_items_from_schema=not is_native_openai,    # 兼容性：移除 minItems 约束
                **({"base_url": api_base} if api_base else {}),
            )
            # 非原生 OpenAI：注入 response_format json_object 保证输出合法 JSON
            if not is_native_openai:
                llm = _patch_json_object_format(llm)
            return llm
    except Exception as e:
        print(f"[Browser-LLM] 创建失败: {e}，回退到 ChatOpenAI 兼容模式")
        from browser_use.llm.openai.chat import ChatOpenAI
        llm = ChatOpenAI(
            model=actual_model,
            api_key=api_key,
            add_schema_to_system_prompt=True,
            dont_force_structured_output=True,
            remove_min_items_from_schema=True,
            **({"base_url": api_base} if api_base else {}),
        )
        return _patch_json_object_format(llm)


def _browser_model_supports_vision() -> bool:
    """
    判断当前 Browser-Use 模型是否支持视觉输入。
    """
    preset = config.MODEL_PRESETS.get(config.BROWSER_MODEL_NAME)
    if not preset:
        preset = config.MODEL_PRESETS.get(config.DEFAULT_MODEL_NAME, {})
    return bool(preset.get("isvision"))


# ==================== Chrome 锁文件清理 ====================

def _cleanup_stale_chrome_locks(user_data_dir: str) -> None:
    """
    清理 Chrome user_data_dir 中的陈旧 Singleton 锁文件

    Docker 容器重建后 hostname 变化，Chrome 的 SingletonLock 仍指向旧 hostname，
    导致 Chrome 误判"另一个进程正在使用 profile"而拒绝启动（超时 30s）。

    此函数在每次启动浏览器前调用，移除三个锁文件：
    - SingletonLock（符号链接，指向 hostname-pid）
    - SingletonSocket（符号链接，指向 Unix socket 路径）
    - SingletonCookie（符号链接，指向 cookie token）
    """
    from pathlib import Path

    lock_names = ["SingletonLock", "SingletonSocket", "SingletonCookie"]
    data_path = Path(user_data_dir)
    if not data_path.exists():
        return

    for name in lock_names:
        lock_file = data_path / name
        # 使用 is_symlink() 而非 exists()，因为损坏的符号链接 exists() 返回 False
        if lock_file.is_symlink() or lock_file.exists():
            try:
                lock_file.unlink()
                print(f"[Browser-Node] 已清理陈旧锁文件: {name}")
            except OSError as e:
                print(f"[Browser-Node] 清理锁文件 {name} 失败: {e}")


async def _ensure_browser_session_ready(browser_session) -> None:
    """
    启动 BrowserSession 并确保 BrowserStateRequestEvent 有 handler。
    """
    await browser_session.start()

    event_bus = getattr(browser_session, "event_bus", None)
    handlers = getattr(event_bus, "handlers", {}) if event_bus else {}
    state_handlers = handlers.get("BrowserStateRequestEvent") or []

    if not state_handlers:
        print("[Browser-Node] ⚠️ BrowserStateRequestEvent handler 缺失，重新挂载 watchdogs")
        setattr(browser_session, "_watchdogs_attached", False)
        await browser_session.attach_all_watchdogs()

    try:
        await asyncio.wait_for(
            browser_session.get_browser_state_summary(include_screenshot=False),
            timeout=20,
        )
    except Exception as e:
        print(f"[Browser-Node] ⚠️ 浏览器状态预检失败，尝试重新挂载 watchdogs: {e}")
        setattr(browser_session, "_watchdogs_attached", False)
        await browser_session.attach_all_watchdogs()
        await asyncio.wait_for(
            browser_session.get_browser_state_summary(include_screenshot=False),
            timeout=20,
        )


# ==================== 预置脚本参数提取 ====================

def _extract_script_params(task: str, phase_details: str, available_files: list[str]) -> dict:
    """
    从任务描述和操作细节中提取预置脚本所需的参数

    通过关键词匹配提取：
    - title: 文章标题
    - author: 作者名
    - docx_path: .docx 文件路径

    Args:
        task: 完整任务描述文本
        phase_details: 阶段操作细节文本
        available_files: 已注册的可上传文件路径列表

    Returns:
        参数字典
    """
    import re
    params = {}
    combined = f"{task}\n{phase_details}"

    # 提取 .docx 文件路径
    # 优先从文本中匹配明确的路径
    docx_matches = re.findall(r'(/\S+\.docx)', combined)
    if docx_matches:
        params["docx_path"] = docx_matches[0]
    elif available_files:
        # 从已注册文件中找 .docx
        docx_files = [f for f in available_files if f.endswith(".docx")]
        if docx_files:
            params["docx_path"] = docx_files[0]

    # 提取作者（匹配"作者"关键词后的内容）
    author_match = re.search(r'作者[：:（(]\s*(.+?)\s*[）)」」]', combined)
    if author_match:
        params["author"] = author_match.group(1).strip("'\"「」")
    else:
        # 匹配"不能吃苦的唐先生"
        if "不能吃苦的唐先生" in combined:
            params["author"] = "不能吃苦的唐先生"

    # 提取标题（匹配 Phase 1 产出中的标题信息）
    title_match = re.search(r'标题[：:]\s*(.+?)(?:\n|$)', combined)
    if title_match:
        title = title_match.group(1).strip().strip("'\"「」")
        # 过滤掉太短或明显不是标题的内容
        if len(title) > 3:
            params["title"] = title

    return params


# ==================== Browser-Use 核心执行 ====================

async def _run_browser_agent(task: str, url: str = "", browser_skill: str = "",
                             unattended: bool = False, skill_name: str = "",
                             phase_details: str = "") -> tuple[str, list[str]]:
    """
    使用 Browser-Use 框架执行浏览器操作

    流程：
    1. 清除进程级代理环境变量（浏览器直连）
    2. 创建 Browser-Use LLM + BrowserSession
    3. 尝试执行预置脚本（确定性步骤），失败则降级
    4. 注册 ask_user 自定义工具
    5. 运行 Agent 并返回结果

    Args:
        task: 完整任务描述
        url: 可选目标 URL
        browser_skill: 匹配到的浏览器技能内容
        unattended: 是否无人值守模式（自动跳过人工交互）
        skill_name: Advisor 选中的技能 ID（如 "wechat-article"），用于查找预置脚本
        phase_details: 阶段操作细节文本，供脚本解析参数

    Returns:
        (格式化的操作结果文本, 本次下载的文件路径列表)
    """
    # 临时清除进程级代理环境变量（浏览器需要直连互联网，不走 Squid）
    _proxy_keys = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']
    _saved_proxy = {k: os.environ.pop(k, None) for k in _proxy_keys}

    try:
        from browser_use import Agent, BrowserSession, Tools, ActionResult

        # --- 1. 创建 LLM ---
        llm = _create_browser_llm()

        # --- 2. 注册自定义工具（ask_user 人工协助）---
        tools = Tools()

        # 用于追踪用户等待时间（排除在超时统计之外）
        _user_wait_seconds = 0.0

        @tools.action(description=(
            "向用户询问信息或请求人工操作。当你需要以下内容时必须调用此工具：\n"
            "- 用户个人信息（姓名、手机号、邮箱、地址等）\n"
            "- 登录凭据（用户名、密码）\n"
            "- 验证码（短信验证码、图片验证码、滑块验证、点选验证等）\n"
            "- 支付确认或其他敏感操作的授权\n"
            "- 任何你不确定的信息\n"
            "对于图片验证码、滑块、点选等需要鼠标操作的场景，"
            "告知用户通过 noVNC 远程桌面直接操作浏览器。\n"
            "禁止自行编造用户个人信息！"
        ))
        async def ask_user_for_browser(question: str) -> ActionResult:
            """浏览器 Agent 向用户请求信息或人工操作"""
            nonlocal _user_wait_seconds
            # 无人值守模式：自动跳过人工等待，返回默认确认
            if unattended:
                print(f"[Browser-Use] 无人值守模式，自动确认: {question[:80]}")
                return ActionResult(extracted_content="用户回复: 已确认，请继续执行")
            # 输出到控制台，附带 noVNC 地址提示
            novnc_hint = f"\n   🖥️  noVNC 远程桌面: {config.NOVNC_URL}"
            print(f"\n🌐 [浏览器Agent] 需要你的帮助：{question}{novnc_hint}")
            try:
                # 记录开始等待时间（排除用户操作时间）
                wait_start = time.monotonic()
                # 在异步上下文中读取用户输入
                loop = asyncio.get_event_loop()
                user_input = await loop.run_in_executor(
                    None, lambda: input("请回复 (如需鼠标操作请先在 noVNC 中完成，然后输入 '已完成'): ")
                )
                # 累加用户等待时间
                _user_wait_seconds += time.monotonic() - wait_start
                print(f"[Browser-Use] 用户响应耗时 {time.monotonic() - wait_start:.1f}s（不计入超时）")
                return ActionResult(extracted_content=f"用户回复: {user_input}")
            except Exception as e:
                return ActionResult(extracted_content=f"无法获取用户输入: {e}")

        # --- 2b. 注册自定义工具（read_local_file 本地文件读取）---
        @tools.action(description=(
            "读取容器内本地文件的内容。当任务需要将本地文件内容（如文章、报告、HTML等）"
            "填入网页编辑器时，必须先用此工具读取文件内容。\n"
            "参数 file_path 支持：\n"
            "- 绝对路径：如 /home/tang/project/opensys/output/article.txt\n"
            "- 相对路径（相对于项目根目录）：如 output/article.txt 或 ./output/article.txt\n"
            "注意：不要使用浏览器内置的 read_file 工具读本地文件，那个只能读下载目录的文件。"
        ))
        async def read_local_file(file_path: str) -> ActionResult:
            """读取容器内本地文件，返回文件内容"""
            from pathlib import Path as _Path

            # 清理路径：去掉前导 ./ 和空白
            clean_path = file_path.strip().lstrip("./")

            # 尝试多种路径解析策略
            candidates = []
            p = _Path(file_path.strip())
            if p.is_absolute():
                candidates.append(p)
            # 相对于项目根目录
            candidates.append(_Path(str(config.PROJECT_ROOT)) / clean_path)
            # 相对于 data 目录
            candidates.append(_Path(str(config.DATA_DIR)) / clean_path)
            # 相对于当前工作目录
            candidates.append(_Path.cwd() / clean_path)

            for candidate in candidates:
                try:
                    if candidate.is_file():
                        content = candidate.read_text(encoding="utf-8")
                        # 截断过长文件（防止 token 爆炸）
                        max_chars = 15000
                        if len(content) > max_chars:
                            content = content[:max_chars] + f"\n\n... (文件已截断，原始 {len(content)} 字符，仅显示前 {max_chars} 字符)"
                        print(f"[Browser-Use] read_local_file 成功: {candidate} ({len(content)} 字符)")
                        return ActionResult(extracted_content=content)
                except Exception as e:
                    continue

            # 所有候选路径都失败
            tried = "\n".join(f"  - {c}" for c in candidates)
            print(f"[Browser-Use] read_local_file 失败: {file_path}")
            return ActionResult(
                extracted_content=f"文件未找到: {file_path}\n已尝试以下路径:\n{tried}\n请检查文件路径是否正确。",
                error=f"文件未找到: {file_path}",
            )

        # Agent 引用容器（供闭包在 agent 创建后动态访问）
        _agent_ref = [None]

        # --- 2c. 注册自定义工具（convert_to_docx 文件格式转换）---
        @tools.action(description=(
            "将本地文件（Markdown、HTML、纯文本等）转换为 .docx 格式。\n"
            "微信公众号等富文本编辑器不支持直接输入 Markdown/HTML，"
            "但支持导入 Word 文档（.docx），导入后可保留标题、加粗、表格等格式。\n"
            "参数：\n"
            "- input_path: 输入文件路径（支持绝对路径和相对路径）\n"
            "- output_path: 输出 .docx 文件路径（可选，默认在同目录生成同名 .docx）\n"
            "转换完成后返回输出文件的绝对路径，可配合「文档导入」功能上传到编辑器。"
        ))
        async def convert_to_docx(input_path: str, output_path: str = "") -> ActionResult:
            """调用 pandoc 将文件转换为 docx 格式"""
            import subprocess
            from pathlib import Path as _Path

            # 复用 read_local_file 的路径解析逻辑
            clean_path = input_path.strip().lstrip("./")
            candidates = []
            p = _Path(input_path.strip())
            if p.is_absolute():
                candidates.append(p)
            candidates.append(_Path(str(config.PROJECT_ROOT)) / clean_path)
            candidates.append(_Path(str(config.DATA_DIR)) / clean_path)
            candidates.append(_Path.cwd() / clean_path)

            # 找到实际存在的输入文件
            resolved_input = None
            for candidate in candidates:
                if candidate.is_file():
                    resolved_input = candidate
                    break

            if not resolved_input:
                tried = "\n".join(f"  - {c}" for c in candidates)
                return ActionResult(
                    extracted_content=f"输入文件未找到: {input_path}\n已尝试:\n{tried}",
                    error=f"输入文件未找到: {input_path}",
                )

            # 确定输出路径
            if output_path.strip():
                out = _Path(output_path.strip())
                if not out.is_absolute():
                    out = resolved_input.parent / out
            else:
                out = resolved_input.with_suffix(".docx")

            # 调用 pandoc 转换
            try:
                result = subprocess.run(
                    ["pandoc", str(resolved_input), "-o", str(out)],
                    capture_output=True, text=True, timeout=30,
                )
                if result.returncode != 0:
                    err_msg = result.stderr.strip() or "未知错误"
                    print(f"[Browser-Use] convert_to_docx 失败: {err_msg}")
                    return ActionResult(
                        extracted_content=f"pandoc 转换失败: {err_msg}",
                        error=f"pandoc 转换失败: {err_msg}",
                    )
                # 动态追加到可上传文件白名单
                out_str = str(out)
                _available_files.append(out_str)
                if _agent_ref[0] and hasattr(_agent_ref[0], 'available_file_paths'):
                    if _agent_ref[0].available_file_paths is None:
                        _agent_ref[0].available_file_paths = [out_str]
                    elif out_str not in _agent_ref[0].available_file_paths:
                        _agent_ref[0].available_file_paths.append(out_str)
                print(f"[Browser-Use] convert_to_docx 成功: {resolved_input} → {out}（已注册为可上传文件）")
                return ActionResult(extracted_content=f"转换成功，docx 文件路径: {out}")
            except FileNotFoundError:
                return ActionResult(
                    extracted_content="pandoc 未安装，无法转换文件格式。请联系管理员安装 pandoc。",
                    error="pandoc 未安装",
                )
            except subprocess.TimeoutExpired:
                return ActionResult(
                    extracted_content="pandoc 转换超时（30秒），文件可能过大。",
                    error="pandoc 转换超时",
                )

        # --- 2d. 注册自定义工具（save_generated_image 配图文件归档）---
        # 场景：豆包连续生成多张图片时，每次下载的文件名可能相同（会覆盖前一张）
        # 每轮保存图片后立即调用此工具，将图片从全局 downloads 移动到任务目录并重命名

        # 预解析任务目录路径（从 task 参数中提取，供闭包使用）
        _task_dir_for_tools = ""
        for _line in task.split("\n"):
            if _line.startswith("任务目录："):
                _task_dir_for_tools = _line.replace("任务目录：", "").strip()
                break

        @tools.action(description=(
            "将刚下载的图片文件归档到任务目录。在豆包 AI 图像生成的多轮生成中，"
            "每次保存图片后必须立即调用此工具，避免下一轮生成的图片覆盖当前图片。\n"
            "参数：\n"
            "- image_id: 图片标识，对应 image_requirements.json 中的 id（如 img_1、img_2）\n"
            "- source_filename: 刚下载的图片文件名（可选，留空则自动检测 downloads 目录中最新的图片文件）"
        ))
        async def save_generated_image(image_id: str, source_filename: str = "") -> ActionResult:
            """将下载的图片移动到任务目录并按 image_id 重命名"""
            import glob
            import shutil

            task_dir = _task_dir_for_tools
            if not task_dir:
                return ActionResult(
                    extracted_content="未找到任务目录路径，无法归档图片。",
                    error="任务目录未知",
                )

            downloads_dir = config.BROWSER_DOWNLOADS_DIR
            task_downloads_dir = os.path.join(task_dir, "downloads")
            os.makedirs(task_downloads_dir, exist_ok=True)

            # 查找源文件：优先用指定文件名，否则取 downloads 目录中最新的图片
            src_path = ""
            if source_filename:
                candidate = os.path.join(downloads_dir, source_filename.strip())
                if os.path.isfile(candidate):
                    src_path = candidate
            if not src_path:
                # 自动检测：找 downloads 目录中最新的图片文件
                img_patterns = [os.path.join(downloads_dir, f"*.{ext}")
                                for ext in ("png", "jpg", "jpeg", "webp", "gif")]
                all_imgs = []
                for pat in img_patterns:
                    all_imgs.extend(glob.glob(pat))
                if all_imgs:
                    # 按修改时间倒序，取最新的
                    all_imgs.sort(key=os.path.getmtime, reverse=True)
                    src_path = all_imgs[0]

            if not src_path or not os.path.isfile(src_path):
                return ActionResult(
                    extracted_content=f"在 {downloads_dir} 中未找到可归档的图片文件。",
                    error="未找到图片文件",
                )

            # 移动并重命名：img_1.png, img_2.jpg...
            ext = os.path.splitext(src_path)[1] or ".png"
            dst_name = f"{image_id}{ext}"
            dst_path = os.path.join(task_downloads_dir, dst_name)
            shutil.move(src_path, dst_path)
            print(f"[Browser-Use] save_generated_image: {os.path.basename(src_path)} → {dst_path}")
            return ActionResult(
                extracted_content=f"✅ 图片已归档: {dst_name} (保存到 {task_downloads_dir})"
            )

        # --- 3. 清理陈旧的 Singleton 锁文件 ---
        # Docker 容器重建后 hostname 变化，Chrome 会误判"另一个进程正在使用 profile"
        # 从而拒绝启动。启动前主动清理这些锁文件。
        _cleanup_stale_chrome_locks(config.BROWSER_USER_DATA_DIR)

        # --- 4. 创建 BrowserSession ---
        # Docker 容器内需要 --no-sandbox（root 用户）
        # user_data_dir 持久化 Cookie/登录状态
        browser_session = BrowserSession(
            headless=config.BROWSER_HEADLESS,
            user_data_dir=config.BROWSER_USER_DATA_DIR,
            downloads_path=config.BROWSER_DOWNLOADS_DIR,
            args=['--no-sandbox', '--disable-dev-shm-usage'],
            enable_default_extensions=False,
        )

        # --- 5. 收集可上传文件路径（browser-use 的 upload_file 需要白名单） ---
        _upload_dirs = [
            Path(str(config.PROJECT_ROOT)) / "output",
            Path(str(config.DATA_DIR)),
            Path("/app/output"),
            Path("/app/data"),
            Path(config.BROWSER_DOWNLOADS_DIR),
        ]
        _available_files = []
        for _dir in _upload_dirs:
            if _dir.is_dir():
                for _f in _dir.rglob("*"):
                    if _f.is_file() and _f.suffix in (
                        ".docx", ".doc", ".pdf", ".txt", ".md", ".html",
                        ".htm", ".csv", ".xlsx", ".xls", ".json",
                        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
                    ):
                        _available_files.append(str(_f))
        # 去重
        _available_files = list(set(_available_files))
        if _available_files:
            print(f"[Browser-Node] 已注册 {len(_available_files)} 个可上传文件")

        # --- 6. 预置脚本执行（确定性步骤加速） ---
        # 当 Skill 声明了 script: true 且存在 script.py 时，先执行确定性步骤
        _script_result = None  # 脚本执行结果
        _script_completed_steps = []  # 脚本完成的步骤列表
        if skill_name:
            script_path = load_skill_script(skill_name)
            if script_path:
                print(f"[Browser-Node] 🚀 发现预置脚本: {script_path}")
                try:
                    import importlib.util
                    spec = importlib.util.spec_from_file_location(f"skill_script_{skill_name}", str(script_path))
                    script_module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(script_module)

                    if hasattr(script_module, "run"):
                        # 启动浏览器并确保 watchdog 就绪
                        await _ensure_browser_session_ready(browser_session)
                        page = await browser_session.get_current_page()

                        if page:
                            # 从 phase_details 和 task 中提取脚本参数
                            script_params = _extract_script_params(task, phase_details, _available_files)
                            print(f"[Browser-Node] 脚本参数: {script_params}")

                            # 构建 ask_user 回调（复用现有的 ask_user 逻辑）
                            async def _script_ask_user(question: str) -> str:
                                if unattended:
                                    return "已确认"
                                print(f"\n🔧 [预置脚本] 需要用户协助: {question}")
                                try:
                                    response = await asyncio.get_event_loop().run_in_executor(
                                        None, lambda: input("请完成操作后按回车继续（或输入信息）: ")
                                    )
                                    return response or "已完成"
                                except EOFError:
                                    return "已确认"

                            _script_result = await script_module.run(
                                session=browser_session,
                                page=page,
                                params=script_params,
                                ask_user_fn=_script_ask_user,
                            )
                            _script_completed_steps = _script_result.get("completed_steps", [])
                            _status = _script_result.get("status", "error")
                            _msg = _script_result.get("message", "")

                            print(f"[Browser-Node] 脚本结果: status={_status}, "
                                  f"完成 {len(_script_completed_steps)} 步: {_script_completed_steps}")

                            if _status == "done":
                                # 脚本完成了全部操作（罕见情况），直接返回结果
                                return f"🌐 **浏览器操作结果**（预置脚本完成）：\n{_msg}", []
                        else:
                            print("[Browser-Node] ⚠️ 无法获取 page，跳过脚本执行")
                    else:
                        print(f"[Browser-Node] ⚠️ 脚本 {script_path} 没有 run 函数")
                except Exception as e:
                    print(f"[Browser-Node] ⚠️ 预置脚本执行异常，降级到纯 LLM: {e}")
                    _script_result = None
                    _script_completed_steps = []

        # --- 7. 构建完整任务 prompt ---
        full_task_parts = [f"任务：{task}"]
        if url:
            full_task_parts.append(f"目标网址：{url}")

        # 如果脚本成功完成了部分步骤，修改任务描述告知 LLM
        if _script_completed_steps:
            completed_text = "\n".join(f"  ✅ {s}" for s in _script_completed_steps)
            remaining_msg = _script_result.get("message", "") if _script_result else ""
            full_task_parts.append(
                f"\n⚡ 预置脚本已完成以下步骤（无需重复）：\n{completed_text}"
                f"\n\n当前状态：{remaining_msg}"
                f"\n请从当前页面状态继续完成剩余操作。"
            )

        full_task_parts.append(
            "\n重要规则："
            "\n- 绝对不要编造或猜测用户的个人信息（姓名、手机、邮箱、密码等），必须使用 ask_user_for_browser 工具询问"
            "\n- 遇到验证码、登录弹窗等需要人工介入的情况，使用 ask_user_for_browser 工具"
            "\n- 完成任务后，提取并返回关键信息作为最终结果"
        )
        full_task = "\n".join(full_task_parts)

        # --- 8. 运行 Browser-Use Agent ---
        print(f"[Browser-Node] 启动浏览器 Agent | headless={config.BROWSER_HEADLESS} | max_steps={config.BROWSER_MAX_STEPS}")

        # step callback：每步执行后通过 event_bus 发布 browser_step 事件，供前端实时展示
        def _on_browser_step(browser_state, agent_output, step_number):
            """browser-use Agent 每步回调，提取关键信息推送给前端"""
            try:
                # 提取 action 列表
                actions = []
                if agent_output and hasattr(agent_output, 'action') and agent_output.action:
                    for act in agent_output.action:
                        # ActionModel 是动态 pydantic 模型，通过 model_dump 提取
                        act_dict = act.model_dump(exclude_unset=True) if hasattr(act, 'model_dump') else {}
                        # 找到非空的 action 名称和参数
                        for key, val in act_dict.items():
                            if val is not None and key != 'index':
                                actions.append({"name": key, "params": val if isinstance(val, dict) else {}})
                                break

                # 提取评价、记忆、下一步目标
                eval_text = ""
                memory_text = ""
                next_goal = ""
                if agent_output:
                    eval_text = getattr(agent_output, 'evaluation_previous_goal', '') or ""
                    memory_text = getattr(agent_output, 'memory', '') or ""
                    next_goal = getattr(agent_output, 'next_goal', '') or ""

                # 提取当前页面 URL
                page_url = ""
                if browser_state and hasattr(browser_state, 'url'):
                    page_url = browser_state.url or ""

                publish_event({
                    "type": "browser_step",
                    "step_number": step_number,
                    "actions": actions,
                    "evaluation": eval_text[:200],
                    "memory": memory_text[:200],
                    "next_goal": next_goal[:200],
                    "page_url": page_url,
                })
            except Exception as e:
                print(f"[Browser-Node] step callback 异常: {e}")

        agent = _agent_ref[0] = Agent(
            task=full_task,
            llm=llm,
            browser_session=browser_session,
            tools=tools,
            max_actions_per_step=5,
            enable_planning=False,
            use_judge=False,
            use_thinking=False,
            use_vision=_browser_model_supports_vision(),
            message_compaction=True,
            register_new_step_callback=_on_browser_step,
            # 注册可上传文件路径白名单（upload_file 操作需要）
            available_file_paths=_available_files if _available_files else None,
            extend_system_message=(
                "遇到需要用户个人信息或验证码时，必须使用 ask_user_for_browser 工具。"
                "禁止编造用户信息。直奔目标，不要创建 todo 文件。\n\n"
                "【本地文件读取】当任务需要将本地文件（文章、报告、HTML 等）内容填入网页时，"
                "必须使用 read_local_file 工具读取文件，不要使用浏览器内置的 read_file（那个只能读下载目录）。"
                "read_local_file 支持绝对路径和相对路径（相对于项目根目录）。\n\n"
                "【文件上传】当需要上传本地文件到网页（如微信公众号「文档导入」）时，"
                "直接使用 upload_file 操作，文件路径已预注册。"
                "如果使用 convert_to_docx 转换了新文件，该文件会自动注册为可上传。\n\n"
                f"【文件下载】浏览器下载的文件保存在 {config.BROWSER_DOWNLOADS_DIR} 目录。"
                "下载完成后请在最终结果中报告文件名和完整路径。"
                + (f"\n\n{browser_skill}" if browser_skill else "")
            ),
        )

        # 确保 BrowserSession 已启动且 watchdog 就绪（Agent.run 内部也会 start，
        # 但预检可以提前发现 handler 注册异常并修复）
        await _ensure_browser_session_ready(browser_session)

        # 运行（超时由 max_steps 控制）
        _browse_start = time.monotonic()
        total_steps = 0
        history = await agent.run(max_steps=config.BROWSER_MAX_STEPS)
        total_steps += len(history.history)

        # --- 9. 步骤用尽自动续行 ---
        # 当 max_steps 用尽但任务未完成时，在同一个 BrowserSession 上创建新 Agent 继续
        # 续行 Agent 携带上次的最终状态摘要，从当前页面继续操作
        _continuation_count = 0
        while (not history.is_done()
               and _continuation_count < config.BROWSER_MAX_CONTINUATIONS):
            _continuation_count += 1
            # 提取上一轮的最后状态摘要，作为续行任务的上下文
            prev_result = history.final_result() or ""
            prev_extracted = history.extracted_content()
            prev_summary_parts = []
            if prev_result:
                prev_summary_parts.append(f"上一轮结果：{prev_result[:500]}")
            if prev_extracted:
                items = [x for x in prev_extracted if x and x.strip()]
                if items:
                    prev_summary_parts.append(f"已提取内容：{'; '.join(items)[:300]}")
            prev_summary = "\n".join(prev_summary_parts) if prev_summary_parts else "上一轮未产出明确结果"

            continuation_task = (
                f"【续行任务】上一轮步骤预算用尽但任务尚未完成，请从当前页面状态继续执行。\n"
                f"{prev_summary}\n\n"
                f"原始任务：\n{full_task}"
            )

            print(f"[Browser-Node] ⚡ 步骤用尽，自动续行 ({_continuation_count}/{config.BROWSER_MAX_CONTINUATIONS})"
                  f" | 已执行 {total_steps} 步，再分配 {config.BROWSER_MAX_STEPS} 步")
            # 记录浏览器续行诊断日志
            log_browser_event({}, "browser_continuation", task=full_task[:300], details={
                "continuation": _continuation_count,
                "max_continuations": config.BROWSER_MAX_CONTINUATIONS,
                "steps_so_far": total_steps,
            })

            # 在同一个 browser_session 上创建新 Agent（页面状态保持）
            agent = _agent_ref[0] = Agent(
                task=continuation_task,
                llm=llm,
                browser_session=browser_session,
                tools=tools,
                max_actions_per_step=5,
                enable_planning=False,
                use_judge=False,
                use_thinking=False,
                use_vision=_browser_model_supports_vision(),
                message_compaction=True,
                register_new_step_callback=_on_browser_step,
                available_file_paths=_available_files if _available_files else None,
                extend_system_message=(
                    "这是续行任务，浏览器已在之前的页面上。直接观察当前页面状态，继续完成未完成的操作。"
                    "不要重新导航到起始页，除非当前页面确实需要。\n\n"
                    "遇到需要用户个人信息或验证码时，必须使用 ask_user_for_browser 工具。"
                    "禁止编造用户信息。直奔目标，不要创建 todo 文件。\n\n"
                    f"【文件下载】浏览器下载的文件保存在 {config.BROWSER_DOWNLOADS_DIR} 目录。"
                    "下载完成后请在最终结果中报告文件名和完整路径。"
                    + (f"\n\n{browser_skill}" if browser_skill else "")
                ),
            )
            history = await agent.run(max_steps=config.BROWSER_MAX_STEPS)
            total_steps += len(history.history)

        _browse_elapsed = time.monotonic() - _browse_start - _user_wait_seconds
        print(f"[Browser-Node] 总耗时 {time.monotonic() - _browse_start:.1f}s"
              f"（AI操作 {_browse_elapsed:.1f}s + 用户等待 {_user_wait_seconds:.1f}s）"
              + (f" | 续行 {_continuation_count} 次" if _continuation_count else ""))

        # --- 7. 提取结果 ---
        result_parts = []

        final_result = history.final_result()
        if final_result:
            result_parts.append(f"🌐 **浏览器操作结果**：\n{final_result}")

        extracted = history.extracted_content()
        if extracted:
            content_items = [item for item in extracted if item and item.strip()]
            if content_items:
                result_parts.append(f"\n📄 **提取的内容**：\n" + "\n".join(content_items))

        # --- 8. 追加下载文件列表（0.12+ 自动追踪） ---
        downloaded = []
        try:
            downloaded = browser_session.downloaded_files
        except Exception:
            pass
        if downloaded:
            dl_lines = [f"  - {f}" for f in downloaded]
            result_parts.append(
                f"\n📥 **下载的文件**（共 {len(downloaded)} 个，保存在 {config.BROWSER_DOWNLOADS_DIR}）：\n"
                + "\n".join(dl_lines)
            )

        if not result_parts:
            result_parts.append("浏览器操作已完成，但未提取到明确结果。")

        result_parts.append(f"\n📊 共执行 {total_steps} 步浏览器操作"
                           + (f"（含 {_continuation_count} 次续行）" if _continuation_count else ""))

        return "\n".join(result_parts), downloaded

    except ImportError as e:
        return (
            f"❌ 浏览器依赖未安装: {e}\n"
            "请确保 Docker 镜像中已安装 browser-use 和 playwright chromium。"
        ), []
    except Exception as e:
        error_detail = traceback.format_exc()
        print(f"[Browser-Node] 异常:\n{error_detail}")
        # 记录浏览器异常诊断日志
        log_browser_event({}, "browser_error", task=full_task[:300] if 'full_task' in locals() else "", error=str(e))
        return f"❌ 浏览器操作失败: {str(e)}", []
    finally:
        # 确保浏览器会话关闭（加超时保护，防止 close() 卡住）
        try:
            if 'browser_session' in locals() and browser_session is not None:
                await asyncio.wait_for(browser_session.close(), timeout=15)
                print("[Browser-Node] 浏览器会话已关闭")
        except asyncio.TimeoutError:
            print("[Browser-Node] ⚠️ 浏览器会话关闭超时（15s），强制跳过")
        except Exception:
            pass
        # 恢复代理环境变量
        for k, v in _saved_proxy.items():
            if v is not None:
                os.environ[k] = v


# ==================== Browser 子代理节点函数 ====================

# 浏览器上下文最大字符数（防止 token 超限）
_MAX_BROWSER_CONTEXT_CHARS = 4000


def _build_browser_context(state: dict, phases: list, current_phase: int) -> str:
    """
    构建浏览器节点的上下文：前序阶段产出物 + 用户原始需求

    复用 Executor 的 _extract_previous_phase_outputs 逻辑，
    将 Phase 1（Understand）确认的具体细节注入浏览器 Agent。

    Args:
        state: 当前 State
        phases: 所有阶段列表
        current_phase: 当前阶段索引

    Returns:
        格式化的上下文文本
    """
    from langchain_core.messages import AIMessage as _AI

    parts = []
    messages = state.get("messages", [])

    # === 1. 前序阶段产出物（重点提取 Phase 1 Understand 确认的细节） ===
    if current_phase > 0:
        # 识别阶段推进分隔标记
        phase_boundaries = []
        for idx, msg in enumerate(messages):
            if not isinstance(msg, _AI):
                continue
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            if content.startswith("✅ Phase ") and "完成" in content:
                try:
                    phase_num = int(content.split("Phase ")[1].split(" ")[0].split("(")[0])
                    phase_boundaries.append((phase_num - 1, idx))
                except (ValueError, IndexError):
                    pass

        prev_parts = []
        for phase_idx in range(current_phase):
            p = phases[phase_idx] if phase_idx < len(phases) else {}
            p_name = p.get("name", f"Phase {phase_idx + 1}")

            # 找到该阶段推进标记的位置
            boundary_idx = None
            for b_phase, b_msg_idx in phase_boundaries:
                if b_phase == phase_idx:
                    boundary_idx = b_msg_idx
                    break

            if boundary_idx is None:
                continue

            # 在推进标记之前向回搜索实质性 AIMessage 产出
            for search_idx in range(boundary_idx - 1, max(boundary_idx - 10, -1), -1):
                msg = messages[search_idx]
                if not isinstance(msg, _AI):
                    continue
                content = msg.content if isinstance(msg.content, str) else str(msg.content)
                # 跳过状态标记消息
                if (content.startswith("✅ Phase") or content.startswith("🔄")
                        or content.startswith("⏭️") or content.startswith("🛑")):
                    continue
                if len(content) > 50:
                    # 截取过长的产出物
                    if len(content) > 2000:
                        content = content[:2000] + "\n... (已截断)"
                    prev_parts.append(f"### Phase {phase_idx + 1}: {p_name}\n{content}")
                    break

        if prev_parts:
            parts.append("## 前序阶段产出物\n" + "\n\n".join(prev_parts))

    # === 2. 已下载的文件（前序 browser_node 产出） ===
    downloaded = state.get("downloaded_files")
    if downloaded:
        dl_lines = "\n".join(f"  - {f}" for f in downloaded)
        parts.append(f"## 已下载的文件\n{dl_lines}")

    # 总量截断控制
    result = "\n\n".join(parts)
    if len(result) > _MAX_BROWSER_CONTEXT_CHARS:
        result = result[:_MAX_BROWSER_CONTEXT_CHARS] + "\n... (上下文已截断)"
    return result


async def browser_node(state: dict) -> dict:
    """
    Browser 浏览器子代理节点：直接驱动 Browser-Use 执行浏览器操作

    由 pipeline_router 在 method=browser 时调度，不经过主 Agent 中转。

    执行流程：
    1. 从 pipeline.phases[current_phase] 获取任务描述 + url + details
    2. 从 advisor_context 获取用户原始需求（补充上下文）
    3. 提取前序阶段产出物（Phase 1 确认的细节）
    4. 读取 rework 反馈（如果是返工）
    5. 按 URL 前缀匹配浏览器技能
    6. 调用 Browser-Use Agent 执行
    7. 将结果写入 messages，供 Reviewer 审查

    Returns:
        State 更新字典
    """
    pipeline = state.get("pipeline", {})
    phases = pipeline.get("phases", [])
    current = state.get("current_phase", 0)

    if current >= len(phases):
        return {"phase_status": "done"}

    phase = phases[current]
    phase_name = phase.get("name", f"Phase {current + 1}")
    phase_desc = phase.get("description", "")
    phase_details = phase.get("details", "")  # 操作细节（收件人、内容、数据字段等）

    # === 获取用户原始需求 ===
    advisor_context = state.get("advisor_context", {}) or {}
    user_request = advisor_context.get("user_request", "")

    # === 提取前序阶段产出物（Phase 1 Understand 确认的细节） ===
    prev_context = _build_browser_context(state, phases, current)

    # === 读取 rework 反馈（审查不通过时的修改意见） ===
    rework_feedback = ""
    if state.get("phase_status") == "rework":
        rework_feedback = state.get("review_feedback", "") or ""
        if rework_feedback:
            print(f"[Browser-Node] 收到 rework 反馈: {rework_feedback[:100]}...")

    # === 获取任务目录路径（前序阶段产出物的存放位置） ===
    task_dir = state.get("_task_dir", "")

    # === 构建浏览器任务描述（丰富上下文） ===
    task_parts = []
    if user_request:
        task_parts.append(f"用户需求：{user_request}")
    task_parts.append(f"当前阶段任务：{phase_desc}")
    # 注入任务目录路径（供浏览器 Agent 定位前序阶段产出的文件）
    if task_dir:
        task_parts.append(f"\n任务目录：{task_dir}")
        task_parts.append(f"  - 草稿/中间文件目录：{task_dir}/drafts/")
        task_parts.append(f"  - 最终输出目录：{task_dir}/output/")
        task_parts.append(f"  - 下载文件目录：{task_dir}/downloads/")
    # 注入操作细节（收件人、内容、数据字段等）
    if phase_details:
        task_parts.append(f"\n操作细节：\n{phase_details}")
    # 注入前序阶段产出物（如 Phase 1 确认的 URL、收件人、内容等）
    if prev_context:
        task_parts.append(f"\n背景信息（前序阶段产出）：\n{prev_context}")
    # 注入 rework 反馈
    if rework_feedback:
        task_parts.append(f"\n⚠️ 上次执行的审查反馈（请根据反馈修正）：\n{rework_feedback}")

    # === 提取 URL（优先级：phase.url > phase_details 中提取 > 用户需求中提取） ===
    url = phase.get("url", "")

    # === 加载浏览器技能（Advisor 选中 > 动态匹配兜底） ===
    _skill_injected_in_task = False  # 标记 Skill 是否已注入 task（避免 extend_system_message 重复注入）
    advisor_selected_skill = phase.get("browser_skill") or ""
    if advisor_selected_skill:
        # Advisor 在规划阶段已选中技能 → 用 load_skill_content 加载全文注入 task（最高优先级位置）
        from ..skill_loader import load_skill_content
        skill_content = load_skill_content(advisor_selected_skill)
        if skill_content:
            task_parts.append(f"\n⛔ 操作规则（必须严格遵守）：\n{skill_content}")
            _skill_injected_in_task = True
            print(f"[Browser-Node] Phase {current + 1} ({phase_name}) Advisor 选中技能 '{advisor_selected_skill}'，已注入 task")
        else:
            print(f"[Browser-Node] ⚠️ Advisor 选中技能 '{advisor_selected_skill}' 但未找到对应 SKILL.md，回退动态匹配")

    task = "\n".join(task_parts)

    # 动态匹配浏览器技能（兜底：Advisor 未选或选的技能不存在时使用）
    browser_skill = ""
    if not _skill_injected_in_task:
        browser_skill = match_browser_skills(url, task)
        if browser_skill:
            print(f"[Browser-Node] Phase {current + 1} ({phase_name}) 动态匹配浏览器技能（兜底）")

    # === 配图阶段前置检查：如果依赖的 image_requirements.json 不存在，跳过该阶段 ===
    # 场景：Advisor 预留了配图阶段，但写作 Executor 判断不需要配图，没有生成需求文件
    if (advisor_selected_skill == "doubao-image"
            and "image_requirements" in (phase_details or "")
            and task_dir):
        img_req_path = os.path.join(task_dir, "drafts", "image_requirements.json")
        if not os.path.isfile(img_req_path):
            print(f"[Browser-Node] Phase {current + 1} ({phase_name}) 配图需求文件不存在 ({img_req_path})，跳过配图阶段")
            return {
                "phase_status": "done",
                "messages": [AIMessage(content=(
                    f"## Phase {current + 1}: {phase_name} — 已跳过\n\n"
                    f"前序写作阶段未生成配图需求文件 (`image_requirements.json`)，判断本文不需要配图，自动跳过本阶段。"
                ))],
            }

    # === 执行浏览器操作 ===
    print(f"[Browser-Node] 开始执行 Phase {current + 1}: {phase_name}")
    result, new_downloads = await _run_browser_agent(
        task, url, browser_skill,
        unattended=state.get("unattended", False),
        skill_name=advisor_selected_skill,
        phase_details=phase_details,
    )

    # === 累积下载文件列表（多次 browser_node 调用跨阶段累积） ===
    existing_downloads = list(state.get("downloaded_files") or [])
    all_downloads = existing_downloads + [f for f in new_downloads if f not in existing_downloads]

    # === 判断执行是否成功 ===
    is_failure = result.startswith("❌") or "操作失败" in result or "依赖未安装" in result

    if is_failure:
        # 失败：设置 review_result=fail，让 phase_done 触发重试/升级
        print(f"[Browser-Node] Phase {current + 1} 执行失败，标记 fail")
        # 记录浏览器任务失败诊断日志
        log_browser_event(state, "browser_fail", task=task[:300], error=result[:500])
        return {
            "phase_status": "done",
            "review_result": "fail",
            "review_feedback": f"浏览器操作失败: {result[:500]}",
            "downloaded_files": all_downloads,
            "messages": [AIMessage(content=(
                f"## Phase {current + 1}: {phase_name} — 浏览器执行失败\n\n"
                f"{result}"
            ))],
        }

    # === 成功：将结果写入 messages（供 Reviewer 审查） ===
    if new_downloads:
        print(f"[Browser-Node] 本次下载 {len(new_downloads)} 个文件，累计 {len(all_downloads)} 个")
    return {
        "phase_status": "done",
        "downloaded_files": all_downloads,
        "messages": [AIMessage(content=(
            f"## Phase {current + 1}: {phase_name} — 浏览器执行结果\n\n"
            f"{result}"
        ))],
    }
