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

from .graph import compile_graph, reset_prompt_cache
from .db.manager import DatabaseManager
from .model_manager import get_llm, list_cached_models, clear_cache, list_available_models, resolve_model_config
from .utils import sanitize_text, ensure_str_content
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
        # 继续已有对话，重置缓存以确保读取最新 memory
        reset_prompt_cache()
        console.print(f"\n[bold blue]🔄 继续对话[/bold blue] | 线程 ID: {thread_id[:8]}...")
    elif new_thread:
        thread_id = str(uuid.uuid4())
        reset_prompt_cache()
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
            reset_prompt_cache()
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
            # 获取用户输入（sanitize_text 清理退格产生的 surrogate 乱码）
            user_input = sanitize_text(Prompt.ask("[bold cyan]你[/bold cyan]"))

            if user_input.strip().lower() in ("exit", "quit", "q"):
                console.print("\n[dim]再见！👋[/dim]")
                break

            if not user_input.strip():
                continue

            # --- 处理 CLI 命令（以 / 开头） ---
            if user_input.strip().startswith("/"):
                cmd_result = await _handle_cli_command(
                    user_input.strip(), current_model_config, db, thread_id, saver, graph
                )
                if cmd_result is None:
                    pass  # 无需修改任何状态
                elif cmd_result.get("_action") == "switch_thread":
                    # 切换对话线程
                    thread_id = cmd_result["thread_id"]
                    graph_config["configurable"]["thread_id"] = thread_id
                    await db.create_conversation(thread_id)
                    reset_prompt_cache()  # 切换线程时重置缓存
                elif cmd_result.get("_action") == "new_thread":
                    # 新建对话线程
                    thread_id = cmd_result["thread_id"]
                    graph_config["configurable"]["thread_id"] = thread_id
                    await db.create_conversation(thread_id)
                    reset_prompt_cache()  # 新线程重置缓存
                elif cmd_result.get("_action") == "delete_thread":
                    # 删除对话后自动切换：如果删的是当前对话，新建一个
                    deleted_id = cmd_result["thread_id"]
                    if deleted_id == thread_id:
                        thread_id = str(uuid.uuid4())
                        graph_config["configurable"]["thread_id"] = thread_id
                        await db.create_conversation(thread_id)
                        reset_prompt_cache()  # 新线程重置缓存
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
                        # Anthropic 返回 list 格式 content，需先转为 str
                        content = sanitize_text(ensure_str_content(chunk.content))
                        if content:  # 跳过空内容（如 Anthropic 的非 text 块）
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
    saver=None, graph=None,
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
            "  例: /del a3f2  或  /del a3f2 b7c1 0e9d\n"
            "[bold]/view[/bold] <ID前缀> [选项] — 查看对话详细内容\n"
            "  选项: brief(摘要) state(状态) export=文件名(导出)\n"
            "  例: /view efe9  或  /view efe9 brief  或  /view efe9 state\n\n"
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

    # ==================== 会话查看命令 ====================

    elif command == "/view":
        if not args_str:
            console.print("[yellow]用法: /view <线程ID前缀> [选项][/yellow]")
            console.print("[dim]选项: brief(摘要) state(状态) export=文件名(导出)[/dim]")
            console.print("[dim]例: /view efe9  |  /view efe9 brief  |  /view efe9 state  |  /view efe9 export=chat.md[/dim]")
            return None

        result = await _handle_view_command(args_str, db, saver)
        return result

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


async def _handle_view_command(args_str: str, db: DatabaseManager, saver) -> None:
    """
    处理 /view 命令：查看指定会话的对话消息、pipeline 状态或导出

    语法: /view <ID前缀> [brief] [state] [export=文件名]
    """
    from pathlib import Path
    import json

    tokens = args_str.split()
    prefix = tokens[0]
    opts = set(t.lower() for t in tokens[1:] if "=" not in t)
    kv_opts = {}
    for t in tokens[1:]:
        if "=" in t:
            k, v = t.split("=", 1)
            kv_opts[k.lower()] = v

    brief = "brief" in opts
    show_state = "state" in opts
    export_file = kv_opts.get("export")

    # 解析完整 thread_id
    conv = await db.get_conversation_by_id(prefix)
    if not conv:
        # 检查多匹配
        cursor = await db.conn.execute(
            "SELECT thread_id, title FROM conversations WHERE thread_id LIKE ? AND status = 'active' LIMIT 5",
            (prefix + "%",),
        )
        rows = await cursor.fetchall()
        if len(rows) > 1:
            console.print(f"[yellow]⚠️ '{prefix}' 匹配到多个对话，请更精确：[/yellow]")
            for r in rows:
                console.print(f"  [cyan]{r[0][:8]}...[/cyan] | {r[1] or '未命名对话'}")
        else:
            console.print(f"[yellow]⚠️ 未找到匹配 '{prefix}' 的对话[/yellow]")
        return None

    full_id = conv["thread_id"]

    # 从 checkpoint 加载 state
    cfg = {"configurable": {"thread_id": full_id}}
    raw = await saver.aget(cfg)
    if not raw:
        console.print(f"[yellow]⚠️ 会话 {full_id[:8]} 的 checkpoint 数据为空[/yellow]")
        return None

    cv = raw.get("channel_values", raw) if isinstance(raw, dict) else raw
    messages = cv.get("messages", [])

    console.print(f"\n[bold cyan]{'='*60}[/bold cyan]")
    console.print(f"[bold cyan] 会话: {full_id[:8]}   消息数: {len(messages)}[/bold cyan]")
    console.print(f"[bold cyan]{'='*60}[/bold cyan]")

    # 显示 pipeline 状态
    if show_state:
        _print_view_state(cv)

    # 导出（默认写到 data/exports/ 目录，Docker 挂载后宿主机可直接访问）
    if export_file:
        from pathlib import Path
        export_dir = config.DATA_DIR / "exports"
        export_dir.mkdir(parents=True, exist_ok=True)
        # 如果用户只给了文件名（无路径分隔符），自动放到 data/exports/
        if "/" not in export_file and "\\" not in export_file:
            export_file = str(export_dir / export_file)
        _export_view_conversation(messages, export_file, full_id)
        return None

    # 打印消息
    if not messages:
        console.print("[dim]  (无消息)[/dim]")
        return None

    for i, msg in enumerate(messages):
        _print_view_message(i, msg, brief=brief)

    console.print()
    return None


def _print_view_message(idx: int, msg, brief: bool = False):
    """格式化并打印单条消息"""
    import json

    msg_type = type(msg).__name__
    content = getattr(msg, "content", "") or ""

    # Anthropic 格式 content: [{"type": "text", "text": "..."}]
    if isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text_parts.append(item.get("text", ""))
            elif isinstance(item, dict) and item.get("type") == "image_url":
                text_parts.append("[图片]")
            else:
                text_parts.append(str(item)[:100])
        content = "\n".join(text_parts)

    tool_calls = getattr(msg, "tool_calls", []) or []
    tool_name = getattr(msg, "name", "") or ""

    # 消息头样式
    if "Human" in msg_type:
        header = "[bold green][{:3d}] 👤 用户[/bold green]".format(idx)
    elif "AI" in msg_type:
        header = "[bold blue][{:3d}] 🤖 AI[/bold blue]".format(idx)
    elif "Tool" in msg_type:
        header = "[bold magenta][{:3d}] 🔧 {}[/bold magenta]".format(idx, tool_name)
    elif "System" in msg_type:
        header = "[dim][{:3d}] ⚙️  System[/dim]".format(idx)
    else:
        header = "[dim][{:3d}] ❓ {}[/dim]".format(idx, msg_type)

    # 工具调用标记
    if tool_calls:
        tc_names = [tc.get("name", "?") for tc in tool_calls]
        header += f"  [yellow]→ {', '.join(tc_names)}[/yellow]"

    console.print(header)

    # 消息内容
    if content:
        if brief:
            short = content[:200].replace("\n", " ")
            suffix = f"[dim]... ({len(content)} 字符)[/dim]" if len(content) > 200 else ""
            console.print(f"      {short}{suffix}")
        else:
            if "Tool" in msg_type and len(content) > 2000:
                console.print("[dim]      ─── 工具输出 ───[/dim]")
                for line in content[:2000].split("\n"):
                    console.print(f"[dim]      {line}[/dim]")
                console.print(f"[dim]      ... (共 {len(content)} 字符，已截断)[/dim]")
                console.print("[dim]      ─── 截断 ───[/dim]")
            else:
                for line in content.split("\n"):
                    console.print(f"      {line}")

    # 工具调用参数（非简要模式）
    if tool_calls and not brief:
        for tc in tool_calls:
            args = tc.get("args", {})
            console.print(f"[yellow]      ┌─ {tc.get('name', '?')} 参数:[/yellow]")
            for k, v in args.items():
                v_str = str(v)
                if len(v_str) > 300:
                    v_str = v_str[:300] + f"... ({len(v_str)} 字符)"
                console.print(f"[yellow]      │  {k}: {v_str}[/yellow]")
            console.print("[yellow]      └─[/yellow]")

    console.print()  # 空行分隔


def _print_view_state(cv: dict):
    """打印 pipeline 和 subtasks 状态"""
    import json

    console.print(f"\n[bold cyan]  ── Pipeline & State ──[/bold cyan]")
    console.print(f"  消息数:       {len(cv.get('messages', []))}")
    console.print(f"  当前阶段:     {cv.get('current_phase', 0)}")
    console.print(f"  返工次数:     {cv.get('_rework_count', 0)}")
    console.print(f"  审查结果:     {cv.get('review_result', '无')}")
    console.print(f"  任务目录:     {cv.get('_task_dir', '无')}")
    console.print(f"  advisor_called: {cv.get('advisor_called', False)}")
    console.print()

    # Pipeline
    pipeline = cv.get("pipeline")
    if pipeline:
        console.print("[bold]  📋 Pipeline:[/bold]")
        console.print(f"     名称: {pipeline.get('name', '?')}")
        console.print(f"     领域: {pipeline.get('domain', '?')}")
        phases = pipeline.get("phases", [])
        console.print(f"     阶段数: {len(phases)}")
        current = cv.get("current_phase", 0)
        for p in phases:
            pid = p.get("id", "?")
            name = p.get("name", "?")
            method = p.get("method", "?")
            skill = p.get("skill", "无")
            review = p.get("review", True)
            desc = p.get("description", "")[:60]
            marker = " [bold yellow]◀ 当前[/bold yellow]" if (isinstance(pid, int) and pid - 1 == current) else ""
            console.print(
                f"     Phase {pid}: [bold]{name}[/bold] [{method}] "
                f"skill={skill} review={review}{marker}"
            )
            if desc:
                console.print(f"[dim]              {desc}[/dim]")
        console.print()
    else:
        console.print("[dim]  📋 Pipeline: 无[/dim]\n")

    # Subtasks
    subtasks = cv.get("subtasks")
    if subtasks:
        console.print("[bold]  📦 子任务:[/bold]")
        for st in subtasks:
            status = st.get("status", "?")
            icon = {"done": "✅", "pending": "⏳", "rework": "🔄", "failed": "❌", "blocked": "🚫"}.get(status, "❓")
            desc = st.get("description", "")[:80]
            console.print(f"     {icon} {st.get('id', '?')}: [{status}] {desc}")
            files = st.get("output_files", [])
            for f in files:
                console.print(f"[dim]        📄 {f}[/dim]")
            output = st.get("output", "")
            if output:
                console.print(f"[dim]        输出: {output[:200]}{'...' if len(output) > 200 else ''}[/dim]")
        console.print()
    else:
        console.print("[dim]  📦 子任务: 无[/dim]\n")

    # Advisor context
    ac = cv.get("advisor_context")
    if ac:
        console.print("[bold]  🧠 Advisor Context:[/bold]")
        console.print(f"     mode: {ac.get('mode', '?')}")
        console.print(f"     request: {ac.get('user_request', '')[:200]}")
        console.print()

    # 其他状态
    skip_keys = {"messages", "pipeline", "subtasks", "current_phase", "_rework_count",
                 "review_result", "review_feedback", "_task_dir", "advisor_called",
                 "advisor_context", "auth_level", "pending_command", "risk_level",
                 "approval_result", "modified_command", "model_config", "_recent_tool_calls"}
    other = {k: cv[k] for k in cv if k not in skip_keys and cv[k] is not None}
    if other:
        console.print("[bold]  📎 其他状态:[/bold]")
        for k, v in other.items():
            console.print(f"     {k}: {str(v)[:200]}")
        console.print()


def _export_view_conversation(messages: list, filepath: str, thread_id: str):
    """导出会话消息到 Markdown 文件"""
    import json
    from pathlib import Path
    from datetime import datetime

    lines = [
        f"# 会话记录: {thread_id[:8]}",
        f"",
        f"完整 ID: `{thread_id}`",
        f"消息数: {len(messages)}",
        f"导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"",
        f"---",
        f"",
    ]

    for i, msg in enumerate(messages):
        msg_type = type(msg).__name__
        content = getattr(msg, "content", "") or ""
        if isinstance(content, list):
            text_parts = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text_parts.append(item.get("text", ""))
                else:
                    text_parts.append(str(item)[:200])
            content = "\n".join(text_parts)

        tool_calls = getattr(msg, "tool_calls", []) or []
        tool_name = getattr(msg, "name", "") or ""

        if "Human" in msg_type:
            lines.append(f"### [{i}] 👤 用户")
        elif "AI" in msg_type:
            tc_info = ""
            if tool_calls:
                tc_names = [tc.get("name", "?") for tc in tool_calls]
                tc_info = f" → {', '.join(tc_names)}"
            lines.append(f"### [{i}] 🤖 AI{tc_info}")
        elif "Tool" in msg_type:
            lines.append(f"### [{i}] 🔧 {tool_name}")
        else:
            lines.append(f"### [{i}] {msg_type}")

        lines.append("")
        if content:
            if "Tool" in msg_type and len(content) > 3000:
                lines.append(f"```\n{content[:3000]}\n... (共 {len(content)} 字符)\n```")
            else:
                lines.append(content)
        lines.append("")

        if tool_calls:
            for tc in tool_calls:
                args = tc.get("args", {})
                lines.append(f"**工具参数** `{tc.get('name', '?')}`:")
                lines.append("```json")
                args_dump = json.dumps(args, ensure_ascii=False, indent=2)
                if len(args_dump) > 1000:
                    args_dump = args_dump[:1000] + "\n... (已截断)"
                lines.append(args_dump)
                lines.append("```")
                lines.append("")

        lines.append("---")
        lines.append("")

    Path(filepath).write_text("\n".join(lines), encoding="utf-8")
    console.print(f"[bold green]✅ 已导出到 {filepath} ({len(messages)} 条消息)[/bold green]")


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
