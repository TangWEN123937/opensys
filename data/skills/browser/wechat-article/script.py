"""
微信公众号文章发布 — 预置脚本（确定性步骤）v2

在 LLM Agent 启动之前，通过 CDP 完成以下确定性操作：
1. 导航到 mp.weixin.qq.com
2. 检测登录状态（需要登录则 ask_user 扫码）
3. 点击「文章」→ 主动切换到新标签页（编辑器）
4. 等待编辑器 DOM 就绪 → 点击「文档导入」→ 上传 .docx
5. 填写标题和作者

v2 改进：
- 点击「文章」后通过 SwitchTabEvent 主动切换到新标签页
- 添加 _wait_for_element 重试轮询，确保 DOM 加载完成
- 文件上传使用 DOM.setFileInputFiles CDP 命令

接口约定：
    async def run(session, page, params, ask_user_fn) -> dict
    返回: {"status": "handoff"|"done"|"error", "message": str, "completed_steps": list[str]}
"""

import asyncio
import traceback


async def _wait_for_element(page, js_expression: str, timeout: float = 15, interval: float = 1.5) -> str | None:
    """
    轮询等待页面中某个 JS 表达式返回非空结果

    Args:
        page: Page 对象
        js_expression: JS 函数体（() => ... 格式），返回 truthy 值表示找到
        timeout: 最大等待秒数
        interval: 轮询间隔秒数

    Returns:
        JS 返回值字符串，超时返回 None
    """
    elapsed = 0.0
    while elapsed < timeout:
        try:
            result = await page.evaluate(js_expression)
            result_str = str(result) if result else ""
            if result_str and result_str != "None" and result_str != "null" and result_str != "not_found":
                return result_str
        except Exception:
            pass
        await asyncio.sleep(interval)
        elapsed += interval
    return None


async def run(session, page, params: dict, ask_user_fn=None) -> dict:
    """
    执行微信公众号文章发布的确定性步骤

    Args:
        session: BrowserSession 实例
        page: 当前 Page 对象（CDP 封装）
        params: {
            "title": str — 文章标题
            "author": str — 作者名（默认「不能吃苦的唐先生」）
            "docx_path": str — .docx 文件绝对路径
        }
        ask_user_fn: 可选的用户交互回调
    """
    completed = []  # 已完成的步骤列表
    title = params.get("title", "")
    author = params.get("author", "不能吃苦的唐先生")
    docx_path = params.get("docx_path", "")

    try:
        # === Step 1: 导航到公众号后台 ===
        await page.goto("https://mp.weixin.qq.com")
        await asyncio.sleep(4)  # 公众平台加载较慢
        completed.append("导航到 mp.weixin.qq.com")

        # === Step 2: 检测登录状态 ===
        current_url = await page.get_url()
        page_title = await page.get_title()

        if "login" in (current_url or "").lower() or "登录" in (page_title or ""):
            if ask_user_fn:
                await ask_user_fn(
                    "请在浏览器中扫码登录微信公众号后台。\n"
                    "登录完成后，我会自动继续执行后续步骤。"
                )
                await asyncio.sleep(5)
                current_url = await page.get_url()
                if "login" in (current_url or "").lower():
                    return {
                        "status": "error",
                        "message": "登录未完成，无法继续",
                        "completed_steps": completed,
                    }
                completed.append("用户完成扫码登录")
            else:
                return {
                    "status": "need_login",
                    "message": "需要用户扫码登录微信公众号后台",
                    "completed_steps": completed,
                }

        completed.append("确认已登录")

        # === Step 3: 点击「文章」创建新图文 ===
        # 记录点击前的标签页数量，用于检测新标签页是否打开
        tabs_before = await session.get_tabs()
        tab_count_before = len(tabs_before)

        article_clicked = False
        try:
            result = await page.evaluate("""() => {
                // 方法1：查找「新的创作」区域中的「文章」按钮
                const items = document.querySelectorAll('.weui-desktop-panel__bd .new-creation__type-item, .creation-type-item');
                for (const el of items) {
                    if (el.textContent.includes('文章')) {
                        el.click();
                        return 'clicked';
                    }
                }
                // 方法2：查找纯文本为「文章」的可见 div
                const divs = document.querySelectorAll('div');
                for (const d of divs) {
                    if (d.textContent.trim() === '文章' && d.offsetParent !== null) {
                        d.click();
                        return 'clicked_fallback';
                    }
                }
                return 'not_found';
            }""")
            if "clicked" in str(result):
                article_clicked = True
        except Exception:
            pass

        if not article_clicked:
            return {
                "status": "handoff",
                "message": "未能找到「文章」按钮，交给 LLM 继续",
                "completed_steps": completed,
            }

        # 等待新标签页打开
        await asyncio.sleep(3)

        # 主动切换到新打开的标签页（编辑器）
        # 使用 SwitchTabEvent(target_id=None) 切换到最近打开的标签页
        from browser_use.browser.events import SwitchTabEvent
        try:
            switch_event = session.event_bus.dispatch(SwitchTabEvent(target_id=None))
            await switch_event
            await switch_event.event_result(raise_if_any=True, raise_if_none=False)
            print("[预置脚本] ✅ 已切换到新标签页（编辑器）")
        except Exception as e:
            print(f"[预置脚本] ⚠️ 切换标签页失败: {e}，尝试 get_current_page")

        # 等待编辑器页面加载
        await asyncio.sleep(4)

        # 重新获取当前 page（新标签页）
        page = await session.get_current_page()
        if page is None:
            return {
                "status": "handoff",
                "message": "编辑器页面未能打开，交给 LLM 继续",
                "completed_steps": completed,
            }

        # 验证确实进入了编辑器（URL 应该包含 appmsg）
        editor_url = await page.get_url()
        print(f"[预置脚本] 当前页面 URL: {editor_url}")
        if "appmsg" not in (editor_url or ""):
            # 可能还没跳转，多等一会再检查
            await asyncio.sleep(3)
            editor_url = await page.get_url()
            if "appmsg" not in (editor_url or ""):
                return {
                    "status": "handoff",
                    "message": f"当前页面不是编辑器 (URL={editor_url})，交给 LLM 继续",
                    "completed_steps": completed,
                }

        completed.append("点击「文章」并切换到编辑器标签页")

        # === Step 4: 文档导入 ===
        if docx_path:
            # 等待编辑器 DOM 中 #js_import_file 出现
            print("[预置脚本] 等待「文档导入」按钮出现...")
            import_ready = await _wait_for_element(page, """() => {
                const btn = document.getElementById('js_import_file');
                return btn ? 'found' : null;
            }""", timeout=15)

            if not import_ready:
                return {
                    "status": "handoff",
                    "message": "等待「文档导入」按钮超时，交给 LLM 继续（已在编辑器页面）",
                    "completed_steps": completed,
                }

            # 点击「文档导入」
            try:
                click_result = await page.evaluate("""() => {
                    const btn = document.getElementById('js_import_file');
                    if (btn) { btn.click(); return 'clicked'; }
                    return 'not_found';
                }""")
                if "clicked" not in str(click_result):
                    return {
                        "status": "handoff",
                        "message": "点击「文档导入」失败，交给 LLM 继续",
                        "completed_steps": completed,
                    }
            except Exception as e:
                return {
                    "status": "handoff",
                    "message": f"点击「文档导入」异常: {e}，交给 LLM 继续",
                    "completed_steps": completed,
                }

            # 等待文件上传弹窗出现
            await asyncio.sleep(2)

            # 等待 file input 出现
            file_input_ready = await _wait_for_element(page, """() => {
                const inputs = document.querySelectorAll('input[type="file"]');
                return inputs.length > 0 ? 'found_' + inputs.length : null;
            }""", timeout=10)

            if not file_input_ready:
                return {
                    "status": "handoff",
                    "message": "文件上传弹窗未出现，交给 LLM 继续（已打开编辑器）",
                    "completed_steps": completed,
                }

            # 上传文件：通过 CDP DOM.setFileInputFiles
            try:
                file_uploaded = False
                elements = await page.get_elements_by_css_selector('input[type="file"]')
                for el in elements:
                    try:
                        info = await el.get_basic_info()
                        bid = info.backend_node_id if hasattr(info, 'backend_node_id') else None
                        if bid:
                            # 获取该节点所在 target 的 CDP session
                            session_id = await page._ensure_session()
                            await page._client.send.DOM.setFileInputFiles(
                                {"files": [docx_path], "backendNodeId": bid},
                                session_id=session_id,
                            )
                            file_uploaded = True
                            print(f"[预置脚本] ✅ 文件已上传: {docx_path}")
                            break
                    except Exception as upload_err:
                        print(f"[预置脚本] 单个 file input 上传失败: {upload_err}")
                        continue

                if not file_uploaded:
                    return {
                        "status": "handoff",
                        "message": "文件上传失败，交给 LLM 继续（已在编辑器+已打开导入弹窗）",
                        "completed_steps": completed,
                    }

                # 等待文档导入处理完成
                await asyncio.sleep(6)
                completed.append(f"文档导入完成: {docx_path}")
            except Exception as e:
                return {
                    "status": "handoff",
                    "message": f"文件上传异常: {e}，交给 LLM 继续",
                    "completed_steps": completed,
                }

        # === Step 5: 填写标题 ===
        # 标题使用 Element API（更可靠，触发正确事件）
        if title:
            try:
                title_elements = await page.get_elements_by_css_selector(
                    '#title, .title_input, [placeholder*="标题"]'
                )
                if title_elements:
                    await title_elements[0].fill(title, clear=True)
                    completed.append(f"标题已填写: {title}")
                    print(f"[预置脚本] ✅ 标题: {title}")
                else:
                    print("[预置脚本] ⚠️ 未找到标题输入框，LLM 补填")
            except Exception as e:
                print(f"[预置脚本] ⚠️ 标题填写失败: {e}，LLM 补填")

        # === Step 6: 填写作者 ===
        if author:
            try:
                author_elements = await page.get_elements_by_css_selector(
                    '#js_author_name, [placeholder*="作者"]'
                )
                if author_elements:
                    await author_elements[0].fill(author, clear=True)
                    completed.append(f"作者已填写: {author}")
                    print(f"[预置脚本] ✅ 作者: {author}")
                else:
                    print("[预置脚本] ⚠️ 未找到作者输入框，LLM 补填")
            except Exception as e:
                print(f"[预置脚本] ⚠️ 作者填写失败: {e}，LLM 补填")

        # === 完成确定性步骤，交给 LLM ===
        handoff_parts = ["LLM 需要继续完成："]
        if f"文档导入完成" not in str(completed):
            handoff_parts.append("文档导入上传 .docx")
        if f"标题已填写" not in str(completed):
            handoff_parts.append("填写标题")
        if f"作者已填写" not in str(completed):
            handoff_parts.append("填写作者")
        handoff_parts.extend(["封面（AI 配图，首篇 2.35:1 比例）", "摘要", "预览确认", "发布"])

        return {
            "status": "handoff",
            "message": (
                f"预置脚本已完成 {len(completed)} 个步骤。"
                f"当前页面在文章编辑器中。\n"
                + "、".join(handoff_parts)
            ),
            "completed_steps": completed,
        }

    except Exception as e:
        # 任何异常都不致命 — 返回 error 让框架降级到纯 LLM
        print(f"[预置脚本] ❌ 异常: {traceback.format_exc()}")
        return {
            "status": "error",
            "message": f"脚本执行异常: {e}",
            "completed_steps": completed,
        }
