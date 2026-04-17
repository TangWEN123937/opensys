"""
OpenSys CLI 交互入口

命令行界面，用于直接与 AI Agent 对话。
支持流式输出、审批交互、对话管理。

用法:
    python -m agent.cli                    # 新建对话
    python -m agent.cli --thread <id>      # 继续已有对话
    python -m agent.cli --list             # 列出所有对话
"""

import asyncio
import uuid
import sys
from typing import Optional

import aiosqlite
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt

from langgraph.types import Command
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

from .graph import compile_graph
from .db.manager import DatabaseManager
from .model_manager import get_llm, list_cached_models, clear_cache, list_available_models, resolve_model_config
from .utils import sanitize_text
from .safe_saver import SafeAsyncSqliteSaver
from . import config


console = Console()


async def main(thread_id: Optional[str] = None, new_thread: bool = False):
    """CLI 主循环

    Args:
        thread_id: 指定的对话线程 ID（--thread 参数）
        new_thread: 是否强制新建对话（--new 参数）
    """
    # 初始化数据库
    db = DatabaseManager()
    await db.initialize()

    # 初始化 LangGraph checkpointer（使用安全序列化器，自动清理 surrogate 字符）
    conn = await aiosqlite.connect(str(config.DB_PATH))
    saver = SafeAsyncSqliteSaver(conn)
    await saver.setup()

    # 编译图
    graph = compile_graph(checkpointer=saver)

    # 对话线程选择逻辑：
    # 1. 指定了 --thread → 使用指定线程
    # 2. 指定了 --new → 新建线程
    # 3. 都没指定 → 自动续接最近的活跃线程，没有则新建
    if thread_id is not None:
        console.print(f"\n[bold blue]🔄 继续对话[/bold blue] | 线程 ID: {thread_id[:8]}...")
    elif new_thread:
        thread_id = str(uuid.uuid4())
        console.print(f"\n[bold green]🆕 新建对话[/bold green] | 线程 ID: {thread_id[:8]}...")
    else:
        # 自动查找最近的活跃线程
        latest = await db.get_latest_conversation()
        if latest:
            thread_id = latest["thread_id"]
            title = latest["title"]
            console.print(
                f"\n[bold blue]🔄 自动续接最近对话[/bold blue] | "
                f"{title} | 线程 ID: {thread_id[:8]}..."
            )
            console.print("[dim]提示: 输入 /new 新建对话, /threads 查看所有对话[/dim]")
        else:
            thread_id = str(uuid.uuid4())
            console.print(f"\n[bold green]🆕 新建对话（首次使用）[/bold green] | 线程 ID: {thread_id[:8]}...")

    # 记录对话
    await db.create_conversation(thread_id)

    graph_config = {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": config.RECURSION_LIMIT,  # P3 pipeline 需要足够的递归深度（默认 50）
    }

    console.print("[dim]输入消息与 AI 对话。输入 'exit' 或 'quit' 退出。[/dim]")
    console.print("[dim]输入 '/help' 查看可用命令。[/dim]\n")

    # 当前模型配置（None 表示使用默认模型）
    current_model_config = None
    console.print(f"[dim]当前模型: {config.DEFAULT_MODEL_NAME} ({config.DEFAULT_MODEL_PROVIDER})[/dim]\n")

    while True:
        try:
            # 获取用户输入
            user_input = Prompt.ask("[bold cyan]你[/bold cyan]")

            if user_input.strip().lower() in ("exit", "quit", "q"):
                console.print("\n[dim]再见！👋[/dim]")
                break

            if not user_input.strip():
                continue

            # --- 处理 CLI 命令（以 / 开头） ---
            if user_input.strip().startswith("/"):
                cmd_result = await _handle_cli_command(
                    user_input.strip(), current_model_config, db, thread_id, saver
                )
                if cmd_result is None:
                    pass  # 无需修改任何状态
                elif cmd_result.get("_action") == "switch_thread":
                    # 切换对话线程
                    thread_id = cmd_result["thread_id"]
                    graph_config["configurable"]["thread_id"] = thread_id
                    await db.create_conversation(thread_id)
                elif cmd_result.get("_action") == "new_thread":
                    # 新建对话线程
                    thread_id = cmd_result["thread_id"]
                    graph_config["configurable"]["thread_id"] = thread_id
                    await db.create_conversation(thread_id)
                elif cmd_result.get("_action") == "delete_thread":
                    # 删除对话后自动切换：如果删的是当前对话，新建一个
                    deleted_id = cmd_result["thread_id"]
                    if deleted_id == thread_id:
                        thread_id = str(uuid.uuid4())
                        graph_config["configurable"]["thread_id"] = thread_id
                        await db.create_conversation(thread_id)
                        console.print(f"[bold green]🆕 已自动新建对话[/bold green] | 线程 ID: {thread_id[:8]}...")
                elif cmd_result.get("_action") == "plan":
                    # /plan 命令：直接进入 Advisor 规划模式（跳过 LLM 调用）
                    plan_task = cmd_result["task"]
                    graph_input = {
                        "messages": [HumanMessage(content=f"/plan {plan_task}")],
                        "auth_level": config.DEFAULT_AUTH_LEVEL,
                        "advisor_context": {
                            "user_request": plan_task,
                            "background": "用户通过 /plan 命令主动触发 Advisor 规划",
                            "constraints": [],
                            "existing_progress": "",
                            "replan_reason": "",
                        },
                    }
                    if current_model_config:
                        graph_input["model_config"] = current_model_config
                    await _run_graph_with_approval(graph, graph_input, graph_config, db, thread_id)
                else:
                    # 模型切换：返回新的 model_config
                    current_model_config = cmd_result
                continue

            # 构建输入
            graph_input = {
                "messages": [HumanMessage(content=user_input)],
                "auth_level": config.DEFAULT_AUTH_LEVEL,
            }
            # 注入模型配置（如果有切换）
            if current_model_config:
                graph_input["model_config"] = current_model_config

            # 流式执行并处理 interrupt
            await _run_graph_with_approval(graph, graph_input, graph_config, db, thread_id)

        except KeyboardInterrupt:
            console.print("\n\n[dim]中断，再见！👋[/dim]")
            break
        except Exception as e:
            console.print(f"\n[bold red]❌ 错误: {str(e)}[/bold red]")
            if config.DEBUG:
                console.print_exception()

    # 清理
    await db.close()
    await conn.close()


async def _run_graph_with_approval(graph, graph_input, graph_config, db, thread_id):
    """
    执行图并处理审批中断

    流程:
    1. 执行图，收集流式输出
    2. 如果遇到 interrupt（审批请求），展示给用户并等待回复
    3. 用户回复后恢复图执行
    4. 重复直到图执行完成
    """
    current_input = graph_input
    ai_content = ""

    while True:
        try:
            # 流式执行
            ai_content = ""
            console.print()  # 空行分隔

            async for event in graph.astream_events(
                current_input, config=graph_config, version="v2"
            ):
                kind = event.get("event", "")
                data = event.get("data", {})

                # LLM 流式 token
                if kind == "on_chat_model_stream":
                    chunk = data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        content = sanitize_text(chunk.content)
                        console.print(content, end="", style="green")
                        ai_content += content

                    # 深度思考内容
                    if chunk and hasattr(chunk, "additional_kwargs"):
                        reasoning = chunk.additional_kwargs.get("reasoning_content")
                        if reasoning:
                            console.print(sanitize_text(reasoning), end="", style="dim italic")

                # 工具调用开始
                elif kind == "on_tool_start":
                    tool_name = event.get("name", "")
                    console.print(f"\n[bold yellow]🔧 调用工具: {tool_name}[/bold yellow]", end="")

                # 工具调用结束
                elif kind == "on_tool_end":
                    tool_name = event.get("name", "")
                    output = sanitize_text(str(data.get("output", "")))
                    # 截断显示
                    if len(output) > 500:
                        display_output = output[:500] + f"... (共 {len(output)} 字符)"
                    else:
                        display_output = output
                    console.print(f"\n[dim]📋 {tool_name} 输出:\n{display_output}[/dim]")

            # 流结束后检查是否有 interrupt（LangGraph v2 中 interrupt 可能不抛异常）
            state = await graph.aget_state(graph_config)
            if state.next:  # 有待恢复的节点 → interrupt 被触发
                resume_value = await _handle_interrupt(state, console, db, thread_id)
                if resume_value is not None:
                    current_input = Command(resume=resume_value)
                    continue  # 继续循环，恢复执行
                else:
                    break  # 无法识别的 interrupt，退出

            # 图正常完成
            if ai_content:
                console.print()  # 最后换行
            console.print()
            break  # 退出循环

        except Exception as e:
            error_msg = str(e)

            # 兜底：检查异常是否是 interrupt（部分 LangGraph 版本会抛异常）
            if "GraphInterrupt" in error_msg or "interrupt" in type(e).__name__.lower():
                state = await graph.aget_state(graph_config)
                if state.next:
                    resume_value = await _handle_interrupt(state, console, db, thread_id)
                    if resume_value is not None:
                        current_input = Command(resume=resume_value)
                        continue
                # 无法识别的 interrupt
                console.print(f"\n[bold red]❌ 意外中断: {sanitize_text(error_msg)}[/bold red]")
                break

            else:
                # 其他错误
                console.print(f"\n[bold red]❌ 执行错误: {sanitize_text(error_msg)}[/bold red]")
                if config.DEBUG:
                    console.print_exception()
                break


async def _handle_interrupt(state, console, db, thread_id) -> object:
    """
    处理 interrupt（审批请求 / ask_user）

    从 state.tasks 中提取 interrupt 数据，展示给用户并收集回复。

    Returns:
        resume_value: 恢复执行的值（dict/str），或 None 表示无法识别的 interrupt
    """
    # 提取 interrupt 数据
    interrupt_data = {}
    for task in state.tasks:
        if hasattr(task, 'interrupts') and task.interrupts:
            interrupt_data = task.interrupts[0].value if task.interrupts[0] else {}
            break

    approval_type = interrupt_data.get("type", "unknown")

    if approval_type == "approval_request":
        # 操作审批
        description = interrupt_data.get("description", "未知操作")
        risk = interrupt_data.get("risk_level", "moderate")
        risk_color = "red" if risk == "dangerous" else "yellow"

        console.print(Panel(
            description,
            title=f"[bold {risk_color}]⚠️ 需要审批[/bold {risk_color}]",
            border_style=risk_color,
        ))

        # 获取用户审批
        choice = Prompt.ask(
            "[bold]请选择[/bold]",
            choices=["y", "n", "m"],
            default="y",
        )

        if choice == "y":
            resume_value = {"action": "approved"}
        elif choice == "m":
            modified = Prompt.ask("[bold]请输入修改后的命令[/bold]")
            resume_value = {"action": "modified", "modified_command": modified}
        else:
            resume_value = {"action": "rejected"}

        # 记录审批
        await db.log_audit(
            event_type="approval",
            thread_id=thread_id,
            details=resume_value,
            result=resume_value["action"],
        )

        return resume_value

    elif approval_type == "ask_user":
        # ask_user 工具请求用户输入
        question = interrupt_data.get("question", "AI 需要你的输入")

        console.print(Panel(
            question,
            title="[bold blue]💬 AI 需要你的回复[/bold blue]",
            border_style="blue",
        ))

        user_reply = Prompt.ask("[bold]请回复[/bold]")
        return user_reply

    elif approval_type == "pipeline_confirmation":
        # Advisor 生成的 pipeline 需要用户确认
        display = interrupt_data.get("display", "")
        options = interrupt_data.get("options", ["确认执行", "拒绝"])

        # 展示 pipeline 规划内容
        if display:
            console.print(Panel(
                display,
                title="[bold magenta]📋 Advisor 执行计划[/bold magenta]",
                border_style="magenta",
            ))
        else:
            console.print("[dim]（无详细计划展示）[/dim]")

        # 获取用户确认（支持三种操作：确认 / 拒绝 / 修改意见）
        console.print(f"[dim]选项: {' / '.join(options)}[/dim]")
        choice = Prompt.ask(
            "[bold]确认执行此计划?[/bold] (y=确认 / n=拒绝 / 直接输入修改意见)",
            default="y",
        )

        _choice = choice.strip()
        _choice_lower = _choice.lower()
        if _choice_lower in ("y", "yes", "确认", "确认执行", "是", "ok"):
            return {"action": "approved"}
        elif _choice_lower in ("n", "no", "拒绝", "否"):
            return {"action": "rejected"}
        else:
            # 用户输入了修改意见
            console.print(f"[dim]📝 将您的意见发送给 Advisor 重新规划...[/dim]")
            return {"action": "revise", "feedback": _choice}

    elif approval_type == "escalation":
        # 阶段执行异常，需要用户介入决策
        display = interrupt_data.get("display", "阶段执行遇到问题，需要你的决定。")
        options = interrupt_data.get("options", ["直接通过", "给出修改意见", "跳过此阶段", "终止任务"])
        reason = interrupt_data.get("reason", "unknown")

        console.print(Panel(
            display,
            title="[bold yellow]⚠️ 需要人工介入[/bold yellow]",
            border_style="yellow",
        ))

        # 展示选项
        for i, opt in enumerate(options, 1):
            console.print(f"  [bold]{i})[/bold] {opt}")

        choice = Prompt.ask(
            "\n[bold]请选择操作（输入编号或直接输入修改意见）[/bold]",
            default="1",
        )

        choice = choice.strip()
        # 如果输入的是编号，映射到 action
        action_map = {"1": "pass", "2": "feedback", "3": "skip", "4": "abort"}
        if choice in action_map:
            action = action_map[choice]
            if action == "feedback":
                # 用户选择给出修改意见，收集详细反馈
                user_fb = Prompt.ask("[bold]请输入你的修改意见[/bold]")
                return {"action": "feedback", "feedback": user_fb}
            return {"action": action}
        else:
            # 用户直接输入了文字 → 当作修改意见
            return {"action": "feedback", "feedback": choice}

    # 无法识别的 interrupt 类型
    console.print(f"\n[bold red]❌ 未知的 interrupt 类型: {approval_type}[/bold red]")
    return None


async def list_conversations():
    """列出所有对话"""
    db = DatabaseManager()
    await db.initialize()

    conversations = await db.list_conversations()
    if not conversations:
        console.print("[dim]暂无对话记录[/dim]")
    else:
        console.print(f"\n[bold]📝 共 {len(conversations)} 个对话：[/bold]\n")
        for conv in conversations:
            console.print(
                f"  [cyan]{conv['thread_id'][:8]}...[/cyan] "
                f"| {conv['title']} "
                f"| {conv['updated_at']}"
            )

    await db.close()


async def _handle_cli_command(
    cmd: str, current_model_config: dict, db: DatabaseManager, current_thread_id: str,
    saver=None,
) -> object:
    """
    处理 CLI 斜杠命令

    返回值：
        - {"_action": "new_thread", "thread_id": ...}: 新建对话
        - {"_action": "switch_thread", "thread_id": ...}: 切换对话
        - {"_action": "delete_thread", "thread_id": ...}: 删除对话
        - dict (无 _action): 新的 model_config（/model 切换时）
        - None: 不修改任何状态
    """
    parts = cmd.split(maxsplit=1)
    command = parts[0].lower()
    args_str = parts[1].strip() if len(parts) > 1 else ""

    if command == "/help":
        console.print(Panel(
            "[bold cyan]— 对话管理 —[/bold cyan]\n"
            "[bold]/new[/bold] — 新建对话\n"
            "[bold]/threads[/bold] — 列出所有对话线程\n"
            "[bold]/switch[/bold] <线程ID前缀> — 切换到指定对话\n"
            "  例: /switch a3f2\n"
            "[bold]/del[/bold] <ID前缀> [更多ID...] — 删除对话（支持批量）\n"
            "  例: /del a3f2  或  /del a3f2 b7c1 0e9d\n\n"
            "[bold cyan]— 模型管理 —[/bold cyan]\n"
            "[bold]/model[/bold] <模型名> — 切换模型\n"
            "  例: /model deepseek-chat\n"
            "[bold]/models[/bold] — 查看所有可用模型\n"
            "[bold]/reset[/bold] — 重置为默认模型\n\n"
            "[bold cyan]— 任务规划 —[/bold cyan]\n"
            "[bold]/plan[/bold] <任务描述> — 直接进入 Advisor 规划模式\n"
            "  例: /plan 去抖音创作者平台采集数据并生成分析报告\n\n"
            "[bold cyan]— 记忆与提示词 —[/bold cyan]\n"
            "[bold]/memory[/bold] — 查看当前记忆文档内容\n"
            "[bold]/prompt[/bold] — 查看用户自定义提示词\n\n"
            "[bold cyan]— 其他 —[/bold cyan]\n"
            "[bold]/help[/bold] — 显示此帮助\n"
            "[bold]exit[/bold] / [bold]quit[/bold] / [bold]q[/bold] — 退出",
            title="[bold]📖 可用命令[/bold]",
            border_style="blue",
        ))
        return None

    # ==================== 对话管理命令 ====================

    elif command == "/new":
        new_id = str(uuid.uuid4())
        console.print(f"[bold green]🆕 新建对话[/bold green] | 线程 ID: {new_id[:8]}...")
        return {"_action": "new_thread", "thread_id": new_id}

    elif command == "/threads":
        conversations = await db.list_conversations()
        if not conversations:
            console.print("[dim]暂无对话记录[/dim]")
        else:
            console.print(f"\n[bold]📝 共 {len(conversations)} 个对话：[/bold]\n")
            for conv in conversations:
                # 标记当前活跃线程
                marker = " [bold green]◀ 当前[/bold green]" if conv["thread_id"] == current_thread_id else ""
                console.print(
                    f"  [cyan]{conv['thread_id'][:8]}...[/cyan] "
                    f"| {conv['title']:20s} "
                    f"| {conv['updated_at']}"
                    f"{marker}"
                )
            console.print("\n[dim]使用 /switch <ID前缀> 切换对话[/dim]")
        return None

    elif command == "/switch":
        if not args_str:
            console.print("[yellow]用法: /switch <线程ID前缀>[/yellow]")
            console.print("[dim]输入 /threads 查看所有对话[/dim]")
            return None

        prefix = args_str.strip()
        conv = await db.get_conversation_by_id(prefix)
        if conv:
            console.print(
                f"[bold blue]🔄 已切换到对话[/bold blue] | "
                f"{conv['title']} | 线程 ID: {conv['thread_id'][:8]}..."
            )
            return {"_action": "switch_thread", "thread_id": conv["thread_id"]}
        else:
            # 检查是否有多个匹配
            cursor = await db.conn.execute(
                "SELECT thread_id, title FROM conversations WHERE thread_id LIKE ? AND status = 'active' LIMIT 5",
                (prefix + "%",),
            )
            rows = await cursor.fetchall()
            if len(rows) > 1:
                console.print(f"[yellow]⚠️ 前缀 '{prefix}' 匹配到多个对话，请提供更精确的 ID：[/yellow]")
                for r in rows:
                    console.print(f"  [cyan]{r[0][:8]}...[/cyan] | {r[1] or '未命名对话'}")
            else:
                console.print(f"[yellow]⚠️ 未找到匹配 '{prefix}' 的对话[/yellow]")
            return None

    elif command in ("/del", "/delete"):
        if not args_str:
            console.print("[yellow]用法: /del <ID前缀> [更多ID...][/yellow]")
            console.print("[dim]例: /del a3f2 b7c1  |  输入 /threads 查看所有对话[/dim]")
            return None

        # 支持空格分隔多个 ID 前缀
        prefixes = args_str.split()

        # 解析所有前缀对应的对话
        matched = []   # [(tid, title), ...]
        failed = []    # [(prefix, reason), ...]
        for prefix in prefixes:
            conv = await db.get_conversation_by_id(prefix)
            if conv:
                matched.append((conv["thread_id"], conv["title"]))
            else:
                # 检查是否多个匹配
                cursor = await db.conn.execute(
                    "SELECT thread_id, title FROM conversations WHERE thread_id LIKE ? AND status = 'active' LIMIT 5",
                    (prefix + "%",),
                )
                rows = await cursor.fetchall()
                if len(rows) > 1:
                    failed.append((prefix, f"匹配到 {len(rows)} 个对话，请更精确"))
                    for r in rows:
                        console.print(f"  [cyan]{r[0][:8]}...[/cyan] | {r[1] or '未命名对话'}")
                else:
                    failed.append((prefix, "未找到"))

        # 报告匹配失败的
        for prefix, reason in failed:
            console.print(f"[yellow]⚠️ '{prefix}': {reason}[/yellow]")

        if not matched:
            return None

        # 二次确认（列出所有待删除）
        console.print(f"[yellow]⚠️ 即将删除 {len(matched)} 个对话：[/yellow]")
        for tid, title in matched:
            console.print(f"  [cyan]{tid[:8]}...[/cyan] | {title}")
        confirm = Prompt.ask("[yellow]确认删除? (y/n)[/yellow]", default="n")
        if confirm.strip().lower() not in ("y", "yes", "是"):
            console.print("[dim]已取消删除[/dim]")
            return None

        # 执行批量删除
        deleted_current = False
        for tid, title in matched:
            ok = await db.delete_conversation(tid)
            if saver:
                try:
                    await saver.adelete_thread(tid)
                except Exception:
                    pass
            if ok:
                console.print(f"[bold red]🗑️ 已删除[/bold red] | {title} | {tid[:8]}...")
                if tid == current_thread_id:
                    deleted_current = True
            else:
                console.print(f"[yellow]⚠️ {tid[:8]}... 删除失败[/yellow]")

        # 如果删除了当前对话，通知主循环新建
        if deleted_current:
            return {"_action": "delete_thread", "thread_id": current_thread_id}
        return None

    # ==================== 记忆管理命令 ====================

    elif command == "/memory":
        if config.MEMORY_FILE.exists():
            content = config.MEMORY_FILE.read_text(encoding="utf-8").strip()
            if content:
                char_count = len(content)
                console.print(Panel(
                    Markdown(content),
                    title=f"[bold]📝 记忆文档[/bold] ({char_count}/{config.MEMORY_MAX_CHARS} 字符)",
                    border_style="blue",
                ))
            else:
                console.print("[dim]记忆文档为空[/dim]")
        else:
            console.print("[dim]记忆文档不存在[/dim]")
        console.print(f"[dim]文件路径: {config.MEMORY_FILE}[/dim]")
        return None

    elif command == "/prompt":
        if config.USER_PROMPT_FILE.exists():
            content = config.USER_PROMPT_FILE.read_text(encoding="utf-8").strip()
            if content:
                console.print(Panel(
                    Markdown(content),
                    title="[bold]📋 用户自定义提示词[/bold]",
                    border_style="green",
                ))
            else:
                console.print("[dim]用户提示词文件为空[/dim]")
        else:
            console.print("[dim]用户提示词文件不存在[/dim]")
        console.print(f"[dim]文件路径: {config.USER_PROMPT_FILE}[/dim]")
        console.print("[dim]提示: 你可以直接编辑此文件来调整 AI 行为，AI 无法修改此文件[/dim]")
        return None

    # ==================== 模型管理命令 ====================

    elif command == "/model":
        if not args_str:
            console.print("[yellow]用法: /model <模型名>[/yellow]")
            console.print("[dim]输入 /models 查看所有可用模型[/dim]")
            return None

        model_name = args_str.strip()

        # 检查是否在预设列表中
        available = list_available_models()
        if model_name not in available:
            console.print(f"[yellow]⚠️ 模型 '{model_name}' 未在预设列表中[/yellow]")
            console.print(f"[dim]可用模型: {', '.join(available)}[/dim]")
            console.print("[dim]请先在 config.py 的 MODEL_PRESETS 中添加配置[/dim]")
            return None

        # 获取完整配置并展示
        mc = resolve_model_config(model_name)
        new_config = {"model_name": model_name}
        console.print(
            f"[bold green]✅ 模型已切换: {model_name}[/bold green]\n"
            f"   provider={mc['model_provider']} | "
            f"api_base={mc.get('api_base') or '(默认)'} | "
            f"thinking={mc.get('thinking_model')} | "
            f"vision={mc.get('isvision')}"
        )
        return new_config

    elif command == "/models":
        # 显示当前模型
        current_name = (current_model_config or {}).get('model_name') or config.DEFAULT_MODEL_NAME
        mc = resolve_model_config(current_name)
        console.print(f"[bold]当前模型:[/bold] {current_name} ({mc['model_provider']})")

        # 显示缓存列表
        cached = list_cached_models()
        if cached:
            console.print(f"[bold]缓存模型:[/bold] {', '.join(cached)}")

        # 显示所有可用预设
        available = list_available_models()
        console.print(f"\n[bold]可用模型预设 ({len(available)}):[/bold]")
        from . import config as cfg
        for name in available:
            preset = cfg.MODEL_PRESETS[name]
            marker = " ◀ 当前" if name == current_name else ""
            key_status = "✅" if preset.get("api_key") else "❌无Key"
            console.print(
                f"  [cyan]{name:30s}[/cyan] "
                f"| {preset['model_provider']:12s} "
                f"| {key_status}"
                f"[bold green]{marker}[/bold green]"
            )
        return None

    elif command == "/reset":
        console.print(f"[bold green]✅ 已重置为默认模型: {config.DEFAULT_MODEL_NAME}[/bold green]")
        clear_cache()
        return {}  # 返回空 dict 清除 model_config

    # ==================== 任务规划命令 ====================

    elif command == "/plan":
        if not args_str:
            console.print("[yellow]用法: /plan <任务描述>[/yellow]")
            console.print("[dim]例: /plan 去抖音创作者平台采集数据并生成分析报告[/dim]")
            return None

        console.print(f"[bold magenta]📋 直接进入 Advisor 规划模式[/bold magenta]")
        console.print(f"[dim]任务: {args_str}[/dim]\n")
        return {
            "_action": "plan",
            "task": args_str,
        }

    else:
        console.print(f"[yellow]未知命令: {command}，输入 /help 查看可用命令[/yellow]")
        return None


def run():
    """CLI 入口点"""
    import argparse

    parser = argparse.ArgumentParser(description="OpenSys AI Agent CLI")
    parser.add_argument("--thread", "-t", type=str, default=None, help="继续指定的对话线程")
    parser.add_argument("--new", "-n", action="store_true", help="强制新建对话（不续接最近线程）")
    parser.add_argument("--list", "-l", action="store_true", help="列出所有对话")
    args = parser.parse_args()

    if args.list:
        asyncio.run(list_conversations())
    else:
        asyncio.run(main(thread_id=args.thread, new_thread=args.new))


if __name__ == "__main__":
    run()
