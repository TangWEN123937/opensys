# OpenSys — 渐进式授权 AI Agent 系统需求文档

> **版本**：v0.3（补充对话记忆、上下文压缩、前端交互、向量混合检索等子系统设计）
> **日期**：2026-03-23
> **作者**：Tang & Cascade

---

## 一、项目概述

### 1.1 项目名称

**OpenSys** — 基于渐进式授权理念的 AI Agent 系统

### 1.2 一句话描述

把 AI Agent（含大模型调用）完整地"养"在 Docker 容器里，给它终端、代码环境等基础能力，让它像一个坐在电脑前的人一样自主工作；通过出站白名单代理控制网络，从审批历史中学习用户偏好，逐步获得自主权。

### 1.3 核心理念

- **AI 的"家"**：AI Agent 完整运行在容器内部（包括大模型调用），拥有容器内的完整操作权限
- **大脑和手脚在一起**：大模型调用在容器内完成，AI 可以直接操作终端、写代码、跑脚本，不需要通过外部 Tool 中转
- **受控的网线**：容器不能直连外网，所有出站流量必须经过宿主机上的代理网关（白名单过滤 + 全量日志）
- **渐进式授权**：AI 从你的审批历史中学习，逐步从"事事请示"演化到"自主执行"
- **人机协作**：AI 遇到需要人类判断的场景（登录、验证码、支付）主动暂停等你介入

### 1.4 为什么选择"大模型在容器内部"

| 维度 | 大模型在宿主机（方案 A） | 大模型在容器内（方案 B，我们的选择） |
|------|------------------------|--------------------------------------|
| **Tool 开发量** | 🔴 巨大，每种能力都要封装成 Tool | ✅ 极少，3 个基础 Tool 就够 |
| **AI 能力上限** | 🔴 被预定义的 Tool 种类限制 | ✅ 无限制，能写代码就能做任何事 |
| **开发维护成本** | 🔴 新场景 = 新 Tool，持续增加 | ✅ 一次搭好，几乎不用改 |
| **灵活性** | 🔴 AI 只能调用你写好的函数 | ✅ AI 自己写代码解决新问题 |
| **架构简洁度** | ⚠️ 宿主机逻辑重 | ✅ 宿主机极其简单 |
| **网络安全** | ✅ 容器可完全无网络 | ⚠️ 容器需要网络，但通过代理白名单管控 |
| **API Key 安全** | ✅ Key 在宿主机 | ⚠️ Key 在容器内，但网络被代理管控 |

**核心选择理由**：方案 A 本质上是用 Tool 层重新发明一个 Shell，开发量巨大且永远不够用。方案 B 让 AI 直接操作终端和代码环境，开发量减少 80%+，AI 能力不受限。

### 1.5 与 OpenClaw 的差异化

| 维度 | OpenClaw | OpenSys |
|------|----------|---------|
| 安全策略 | 审批 + 允许列表 | 容器隔离 + 代理网关 + 审批 + 审计 |
| 权限模型 | 静态配置 | 渐进式授权（从历史学习） |
| 网络控制 | 默认有网 | 出站白名单代理，全量日志 |
| 隔离级别 | 可选 Docker | 强制 Docker + 安全加固 |
| AI 操作方式 | 通过预定义 Tool | 直接操作终端和代码环境 |
| 图形界面 | 不支持 | VNC 可观看 AI 操作浏览器 |
| 人机协作 | 基础审批 | AI 主动暂停等用户介入 |

---

## 二、系统架构

### 2.1 总体架构

```
┌───────────────────────────────────────────────────────────────────┐
│                            宿主机                                 │
│                                                                   │
│  ┌───────────────────────┐     ┌────────────────────────────────┐│
│  │   轻量管理层           │     │   Squid 代理网关              ││
│  │  - 启动 / 停止容器     │     │  - 出站白名单过滤             ││
│  │  - 审计日志查看        │     │  - 全量请求日志               ││
│  │  - 审批通知推送        │     │  - 流量限速                   ││
│  │  - 容器健康监控        │     │  - 动态白名单（审批后追加）   ││
│  └───────────┬───────────┘     │  - 内容过滤（拦截危险下载）   ││
│              │ Docker API      └──────────┬─────────────────────┘│
│              ▼                    内部网络 │                      │
│  ┌────────────────────────────────────────┴────────────────────┐ │
│  │              AI 容器（大脑 + 手脚都在里面）                  │ │
│  │                                                             │ │
│  │  ┌───────────────────────────────────────────────────────┐  │ │
│  │  │  AI Agent（LangChain / 自研框架）                     │  │ │
│  │  │  - 调用远程大模型 API（通过代理网关出去）             │  │ │
│  │  │  - 3 个基础 Tool：终端执行、写脚本执行、请求用户帮助 │  │ │
│  │  │  - 审批记忆（本地 SQLite）                            │  │ │
│  │  │  - 任务管理（状态机）                                 │  │ │
│  │  └───────────────────────────────────────────────────────┘  │ │
│  │                                                             │ │
│  │  执行环境：                                                 │ │
│  │  Python, Node.js, Git, curl, ffmpeg, Playwright, ...        │ │
│  │                                                             │ │
│  │  ✅ 容器内完全自由：装软件、跑代码、写文件、操作浏览器      │ │
│  │  ✅ 能上网：但只能通过代理网关，白名单内的才放行            │ │
│  │  ❌ 不能直连外网：绕不过代理                                │ │
│  │  ❌ 不能访问宿主机其他服务：网络隔离                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                         代理网关                                  │
│                              ▼                                    │
│                     ┌──────────────┐                              │
│                     │    互联网    │                              │
│                     │ （白名单内） │                              │
│                     └──────────────┘                              │
└───────────────────────────────────────────────────────────────────┘
```

### 2.2 组件职责

| 组件 | 运行位置 | 职责 |
|------|---------|------|
| **轻量管理层** | 宿主机 | 启动/停止容器、审计日志查看、审批通知推送、容器健康监控 |
| **Squid 代理网关** | 宿主机 | 出站白名单过滤、请求日志、流量限速、动态白名单管理 |
| **AI Agent** | 容器内 | 接收指令、调用远程大模型 API、决策、直接执行操作 |
| **审批记忆库** | 容器内（SQLite，持久卷） | 存储审批历史、操作指纹、置信度计算 |
| **审计日志** | 容器内（持久卷）+ 同步到宿主机 | 记录所有操作，可追溯可回滚 |

### 2.3 大模型调用链路

```
用户指令 → AI Agent（容器内）→ 通过代理网关 → 远程大模型 API（Claude/GPT-4/Gemini）
                                                       ↓
                                                 返回决策结果
                                                       ↓
                                     AI Agent 直接在容器内执行操作
                                     （敲终端 / 写脚本运行 / 操作浏览器）
```

- 大模型调用在**容器内**完成，AI 的大脑和手脚在同一个地方
- API Key 存在容器的持久卷中（环境变量或配置文件）
- 所有网络请求（包括大模型 API）都经过宿主机代理网关，可审计

### 2.4 宿主机的角色（极其简单）

宿主机只需要运行：

1. **Docker** — 运行 AI 容器
2. **Squid** — 代理网关
3. **一个管理脚本** — 启动/停止/查日志/推送审批通知

宿主机**不需要**：Python 环境、LangChain、大模型 SDK、任何业务逻辑。

---

## 三、安全设计

### 3.1 四层安全防线

| 层级 | 实现方式 | 作用 |
|------|---------|------|
| **第一层：容器隔离** | Docker + 资源限制 + 安全加固 | AI 被限制在容器内，即使崩溃也不影响宿主机 |
| **第二层：网络控制** | Squid 出站白名单代理 + 全量日志 | AI 能上网但受控，所有流量可审计 |
| **第三层：审批机制** | 高危操作需人工确认 | 用户做最终决策者 |
| **第四层：审计回滚** | 所有操作有日志 + 数据卷快照 | 出事可查可恢复 |

### 3.2 容器安全配置

```bash
docker run \
  # ===== 资源限制（防止 AI 拖垮宿主机） =====
  --memory 4g                       # 最多 4G 内存
  --memory-swap 4g                  # 禁用 swap
  --cpus 2                          # 最多 2 核 CPU
  --pids-limit 256                  # 最多 256 个进程（防 fork 炸弹）
  --storage-opt size=20G            # 容器磁盘最多 20G
  --ulimit nofile=1024:2048         # 限制打开文件数

  # ===== 安全加固（防止容器逃逸） =====
  --cap-drop ALL                    # 丢弃所有 Linux 能力
  --security-opt no-new-privileges  # 禁止提权
  --security-opt seccomp=default    # 启用 seccomp 系统调用过滤
  --userns-remap=default            # 用户命名空间映射，容器 root ≠ 宿主机 root

  # ===== 文件系统 =====
  --read-only                       # 根文件系统只读
  --tmpfs /tmp:rw,nosuid,size=2g              # 临时文件
  --tmpfs /var/tmp:rw,noexec,nosuid,size=512m # var 临时文件
  --tmpfs /run:rw,noexec,nosuid,size=256m     # 运行时文件

  # ===== 网络（只能通过代理出去） =====
  --network ai-internal             # 内部网络，只能访问代理网关
  --dns none                        # 无 DNS，防止绕过代理
  -e HTTPS_PROXY=http://proxy:3128  # 通过代理访问外网
  -e HTTP_PROXY=http://proxy:3128   # 通过代理访问外网

  # ===== 数据卷 =====
  -v /workspace:/workspace:ro       # 用户工作区（只读）
  -v ai-data:/home/ai/data:rw      # AI 的记忆、配置、审批记录
  -v ai-output:/output:rw          # AI 的输出目录

  ai-sandbox
```

### 3.3 网络白名单分层

| 层级 | 放行方式 | 域名示例 |
|------|---------|---------|
| **永久放行** | 默认开通，无需审批 | `api.openai.com`, `api.anthropic.com`, `pypi.org`, `npmjs.org`, `github.com`, `ubuntu.com` |
| **审批放行** | AI 请求时需用户批准，任务结束自动移除 | 任意用户指定的网站 |
| **永久禁止** | 无论什么情况都拦截 | 暗网、已知恶意域名、用户指定的黑名单 |

### 3.4 API Key 安全

由于 API Key 在容器内，需要额外保护：

- Key 存储在持久卷的加密配置文件中，不硬编码在镜像里
- 网络被代理管控：即使 Key 泄露，攻击者也只能访问白名单内的域名
- 代理日志记录所有 API 调用，可检测异常使用模式（如突然的高频调用）
- 容器重建时 Key 跟随持久卷，无需重新配置

### 3.5 容器崩溃对宿主机的影响

| 场景 | 影响 | 防御措施 |
|------|------|---------|
| AI 吃光资源 | ✅ 无影响 | `--memory` `--cpus` `--pids-limit` 限制到位 |
| AI 写满磁盘 | ✅ 无影响 | `--storage-opt size=20G` |
| AI 删光容器文件 | ✅ 无影响 | 容器独立文件层，重建即可；持久卷数据不丢 |
| AI 篡改挂载文件 | ✅ 无影响 | 工作区 `:ro` 只读，输出用独立卷 |
| 外部攻击入侵容器 | ✅ 无影响 | 容器不暴露端口，代理网关拦截入站 |
| 内核漏洞逃逸 | ⚠️ 极低概率 | `--userns-remap` + `--cap-drop ALL` + seccomp + 保持内核更新 |

---

## 四、AI Agent Tool 层设计（极简）

### 4.1 设计哲学

**不给 AI 写几十个 Tool，而是给它最基础的操作能力，让它自己组合出无限能力。**

就像给一个人一台电脑 + 终端 + 代码编辑器，他就能做任何事——不需要为每个任务单独写一个按钮。

### 4.2 三个基础 Tool

| Tool 名称 | 功能 | 说明 |
|-----------|------|------|
| **`run_terminal`** | 在终端执行命令 | 覆盖所有 CLI 操作：文件管理、Git、ffmpeg、curl、apt、pip 等 |
| **`write_and_run_script`** | 写脚本并执行 | 支持 Python / Node.js / Bash，用于复杂多步骤任务 |
| **`ask_user`** | 请求用户介入 | AI 遇到障碍（登录、验证码、不确定的决策）时主动暂停 |

### 4.3 AI 如何组合出复杂能力

| 用户需求 | AI 的做法 | 用到的 Tool |
|---------|----------|------------|
| "帮我把这个视频转成 MP4" | `ffmpeg -i input.avi output.mp4` | `run_terminal` |
| "爬取某网站的数据" | 自己写 Python 脚本用 requests + BeautifulSoup | `write_and_run_script` |
| "帮我自动登录网站" | 写 Playwright 脚本 → 遇到验证码 → 暂停等用户 | `write_and_run_script` + `ask_user` |
| "分析这份 CSV 数据" | 写 pandas 脚本分析 + matplotlib 画图 | `write_and_run_script` |
| "安装一个新工具" | `pip install xxx` 或 `apt install xxx` | `run_terminal` |
| "帮我把 Word 转 PDF" | `libreoffice --convert-to pdf doc.docx` | `run_terminal` |
| "帮我 OCR 识别图片" | 写 Python 脚本调 tesseract | `write_and_run_script` |

**AI 的能力上限 = 容器内安装的软件 + AI 的编程能力，而不是你预定义了多少 Tool。**

### 4.4 Tool 执行流程（含审批）

```
AI 决定执行某个操作（如跑一条命令）
       ↓
AI Agent 内部提取操作指纹
       ↓
查询本地审批记忆库 → 计算置信度
       ↓
  ┌─── 置信度 > 0.8 ───→ 自动执行 → 记录审计日志
  │
  ├─── 0.5 < 置信度 < 0.8 ───→ 通知用户后执行 → 记录
  │
  └─── 置信度 < 0.5 ───→ 暂停，通过 ask_user 请求审批
                                    ↓
                           用户批准 / 拒绝
                                    ↓
                           记录到审批记忆库
```

---

## 五、渐进式授权设计

### 5.1 四个授权阶段

| 阶段 | 触发条件 | 网络权限 | 操作权限 | 用户角色 |
|------|---------|---------|---------|---------|
| **完全监督** | 第 1-2 周 | 仅永久白名单 | 所有非只读操作需审批 | 手把手教 |
| **模式识别** | 50+ 审批记录 | 历史通过的域名自动放行 | 常见场景自动执行 | 观察确认 |
| **半自主** | 正确率 >90% | 常见网站自动放行，陌生域名审批 | 低风险自动，中风险报告，高风险审批 | 只审边界 |
| **高度自主** | 用户主动开启 | 大部分自动放行，红线仍拦截 | 日常全自动，红线操作仍审批 | 核心权限不放手 |

### 5.2 操作指纹系统

对每个操作进行结构化分解，用于匹配历史审批记录：

```json
{
  "tool": "run_terminal",            // 工具类型
  "command_pattern": "git commit *", // 命令模式（通配符）
  "target_path": "/workspace/*",    // 目标路径
  "impact_scope": "local",          // 影响范围：local / network / system
  "risk_level": "low",              // 风险级别：low / medium / high / critical
  "timestamp": "2026-03-23T20:00:00Z",
  "approved": true,                  // 用户是否批准
  "confidence": 0.85                 // 置信度
}
```

### 5.3 置信度计算规则

- **基于相似操作指纹的历史审批**计算
- **时间衰减**：3 个月前的记录权重减半
- **阈值**：置信度 > 0.8 自动执行，0.5-0.8 报告后执行，< 0.5 必须审批
- **负反馈加权**：一次拒绝 = 抵消 5 次批准

### 5.4 权限回退机制

- **错误降级**：AI 执行了一次被用户标记为"错误"的自动操作 → 该类操作降回审批模式
- **时间衰减**：用户 30 天未使用 → 自主权限衰减一级
- **手动降级**：用户随时可手动将 AI 降回任意阶段

### 5.5 安全基线白名单（初期免审批）

以下操作即使在"完全监督"阶段也不需要审批：

- **纯只读操作**：`ls`, `cat`, `head`, `tail`, `find`, `grep`, `wc`, `file`, `stat`, `tree`
- **容器内部写操作**：写入 `/output` 和 `/home/ai/data`（AI 自己的地盘）
- **查看类命令**：`python --version`, `node --version`, `git status`, `git log`, `which`, `env`
- **大模型 API 调用**：永久白名单域名的 HTTPS 请求

---

## 六、人机协作设计

### 6.1 AI 主动暂停场景

| 场景 | AI 检测方式 | AI 行为 | 用户操作 |
|------|-----------|--------|---------|
| 登录页面 | URL 含 `/login` 或检测到密码输入框 | 调用 `ask_user`，暂停等待 | 通过 VNC 输入密码 |
| 验证码 | 检测到 captcha 元素 | 调用 `ask_user`，暂停等待 | 手动完成验证码 |
| 支付确认 | 进入支付页面 | 调用 `ask_user`，暂停等待 | 确认金额后支付 |
| AI 不确定 | 置信度低于阈值 | 调用 `ask_user`，描述问题 | 告诉 AI 怎么做 |
| 陌生域名 | 代理网关拦截了请求 | 调用 `ask_user`，请求域名审批 | 批准或拒绝 |
| 操作失败 | 命令返回错误且无法自行修复 | 调用 `ask_user`，报告错误 | 指导 AI 下一步 |

### 6.2 恢复机制

- **方式 A**：用户通过交互界面回复消息，AI 收到后继续
- **方式 B**：AI 后台监听状态变化（如 URL 跳转），检测到操作完成后自动恢复
- **超时保护**：10 分钟无响应则放弃当前子任务，保存进度

### 6.3 VNC 图形界面（可选）

- 容器内运行 **Xvfb + Fluxbox + x11vnc**
- 用户通过 **noVNC（WebSocket + TLS）** 在浏览器中观看 AI 操作
- VNC 只监听 `localhost`，通过 SSH 隧道或 noVNC 访问
- 用户可以随时用鼠标**抢过控制权**，手动操作后让 AI 继续
- 资源开销约 1GB 内存，仅在需要浏览器自动化时启用
- AI 不记录密码等敏感信息，所有交接记录到审计日志

---

## 七、容器内应用分层

### 7.1 基础镜像

**Ubuntu 22.04 LTS** — 图形应用最成熟、包最全、社区支持最好

### 7.2 应用分层

| 层级 | 应用 | 作用 |
|------|------|------|
| **核心基础** | Python 3.11+, Node.js 20+, Git, curl, wget, sqlite3, jq | 写代码、跑脚本、存数据、基础网络工具 |
| **AI Agent 运行时** | LangChain, openai SDK, anthropic SDK | AI Agent 核心框架 + 大模型调用 |
| **常用工具** | ffmpeg, ImageMagick, pandoc, Playwright | 音视频、图片、文档、浏览器自动化 |
| **高阶扩展** | LibreOffice, tesseract, graphviz | 办公文档、OCR、画图 |
| **图形界面**（可选） | Xvfb + Fluxbox + x11vnc + noVNC | VNC 观看 AI 操作浏览器 |

---

## 八、数据设计

### 8.1 数据卷划分

| 卷名 | 挂载路径 | 读写权限 | 用途 |
|------|---------|---------|------|
| 宿主机工作区 | `/workspace` | 只读 | 用户的代码、文档（AI 只能读不能改） |
| `ai-data` | `/home/ai/data` | 读写 | AI 的记忆、配置、API Key、审批记录、审计日志 |
| `ai-output` | `/output` | 读写 | AI 生成的最终输出文件（用户可在宿主机查看） |

### 8.2 审批记忆库（SQLite，存储在 ai-data 卷）

```sql
-- 审批记录表
CREATE TABLE approval_history (
    id INTEGER PRIMARY KEY,
    operation_fingerprint TEXT NOT NULL,  -- 操作指纹（JSON）
    tool_name TEXT NOT NULL,              -- Tool 名称（run_terminal / write_and_run_script）
    command TEXT,                          -- 具体命令或脚本摘要
    risk_level TEXT NOT NULL,             -- 风险级别：low / medium / high / critical
    approved BOOLEAN NOT NULL,            -- 用户是否批准
    user_comment TEXT,                    -- 用户备注
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 网络白名单表（与宿主机 Squid 同步）
CREATE TABLE network_whitelist (
    id INTEGER PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,          -- 域名
    layer TEXT NOT NULL,                  -- permanent / dynamic / blocked
    added_by TEXT NOT NULL,               -- system / user / ai_request
    expires_at TIMESTAMP,                 -- 过期时间（dynamic 类型）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 审计日志表
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,             -- 任务会话 ID
    tool_name TEXT NOT NULL,              -- 使用的 Tool
    command TEXT,                          -- 执行的命令或脚本
    input_summary TEXT,                   -- 输入摘要
    output_summary TEXT,                  -- 输出摘要（截断保存）
    status TEXT NOT NULL,                 -- success / failed / timeout / cancelled
    duration_ms INTEGER,                  -- 执行耗时
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 8.3 备份策略

- **`ai-data` 卷**：每日快照，保留 7 天（包含审批记忆和审计日志）
- **`ai-output` 卷**：按任务 ID 归档
- **审计日志定期同步到宿主机**：便于在容器外查看，保留 90 天
- **网络白名单双向同步**：容器内 SQLite ↔ 宿主机 Squid 配置

---

## 九、对话记忆永久存储系统

### 9.1 设计目标

AI 的所有对话记忆必须永久持久化，容器重建后对话历史不丢失。参考现有 AI_JOIN 项目中基于 `AsyncSqliteSaver` + LangGraph Checkpoint 的成熟方案。

### 9.2 存储架构

```
对话记忆存储（SQLite，位于 ai-data 持久卷）
├── Checkpoint 存储（LangGraph 内置）    ← 完整对话状态快照
├── 对话索引表（自建）                   ← 会话元数据、话题摘要
└── 消息归档表（自建）                   ← 长期历史消息（超出上下文窗口的）
```

### 9.3 数据库表结构

```sql
-- ==================== LangGraph 内置表（自动创建） ====================
-- checkpoints        — 对话状态快照（messages、todos、中间状态等）
-- checkpoint_writes  — 增量写入记录
-- checkpoint_blobs   — 二进制数据（大消息体、工具输出等）

-- ==================== 自建扩展表 ====================

-- 对话会话索引表（管理所有对话线程）
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY,
    thread_id TEXT NOT NULL UNIQUE,      -- LangGraph thread_id
    user_id TEXT NOT NULL,               -- 用户标识
    title TEXT,                          -- 对话标题（AI 自动生成）
    topic_summary TEXT,                  -- 话题摘要（由总结模型生成）
    model_name TEXT,                     -- 使用的模型名称
    message_count INTEGER DEFAULT 0,     -- 消息总数
    last_active_at TIMESTAMP,            -- 最后活跃时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 消息归档表（存储被压缩/移出上下文窗口的历史消息）
CREATE TABLE archived_messages (
    id INTEGER PRIMARY KEY,
    thread_id TEXT NOT NULL,             -- 所属对话线程
    message_id TEXT NOT NULL,            -- LangGraph 消息 ID
    role TEXT NOT NULL,                  -- human / ai / tool / system
    content TEXT NOT NULL,               -- 消息内容（纯文本，图片已移除）
    content_summary TEXT,                -- 消息摘要（压缩时生成）
    tool_calls TEXT,                     -- 工具调用记录（JSON，AI 消息才有）
    token_count INTEGER,                 -- 原始 token 数
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 归档时间
    original_timestamp TIMESTAMP,        -- 原始发送时间
    FOREIGN KEY (thread_id) REFERENCES conversations(thread_id)
);
CREATE INDEX idx_archived_thread ON archived_messages(thread_id);
CREATE INDEX idx_archived_role ON archived_messages(role);

-- 对话话题摘要历史（每次触发总结时记录，用于长期记忆检索）
CREATE TABLE topic_summaries (
    id INTEGER PRIMARY KEY,
    thread_id TEXT NOT NULL,
    summary TEXT NOT NULL,               -- 阶段性话题摘要
    message_range TEXT,                  -- 覆盖的消息范围（如 "msg_001 ~ msg_050"）
    token_count INTEGER,                 -- 摘要 token 数
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES conversations(thread_id)
);
```

### 9.4 Checkpoint 生命周期

```
用户发消息 → AI Agent 处理 → LangGraph 自动写入 Checkpoint
                                         ↓
                              AsyncSqliteSaver.aput()
                                         ↓
                              SQLite 持久化到 ai-data 卷
                                         ↓
                         容器重建后 → 从持久卷恢复 → 对话无缝继续
```

### 9.5 对话管理功能

| 功能 | 实现方式 |
|------|---------|
| 新建对话 | 生成新 thread_id，插入 conversations 表 |
| 恢复对话 | 通过 thread_id 从 Checkpoint 加载完整状态 |
| 对话列表 | 查询 conversations 表，按 last_active_at 排序 |
| 话题自动命名 | 首次 3 轮对话后，调用总结模型生成对话标题 |
| 删除对话 | 软删除 conversations 记录 + 清理对应 Checkpoint |
| 消息回溯 | 支持回退到指定消息 ID（截断后续消息，重写 Checkpoint） |
| 消息重新生成 | 删除最后一条 AI 回复，重新调用模型 |

---

## 十、上下文压缩中间件系统

### 10.1 设计目标

大模型的上下文窗口有限（4K ~ 200K tokens），长对话必须进行智能压缩，同时尽可能保留关键信息。参考现有 AI_JOIN 项目中 `MultimodalSummarizationMiddleware` 的渐进式压缩方案。

### 10.2 压缩中间件架构

```
用户消息进入
      ↓
┌─────────────────────────────────────────────────────┐
│  上下文压缩中间件（在模型调用前拦截）                │
│                                                     │
│  1. 计算当前消息总 token 数                         │
│  2. 检查是否触发压缩条件                            │
│  3. 如果触发：                                      │
│     a. 保留最近 N 条消息不动                        │
│     b. 将更早的消息归档到 archived_messages 表       │
│     c. 调用总结模型生成阶段性摘要                   │
│     d. 用摘要替换被移除的消息                       │
│  4. 多模态压缩（图片渐进式压缩/移除）              │
│  5. 将处理后的消息传给大模型                        │
└─────────────────────────────────────────────────────┘
```

### 10.3 压缩触发条件

| 条件类型 | 阈值 | 说明 |
|---------|------|------|
| **消息数量** | ≥ 60 条 | 约 6-8 轮完整对话（含工具调用） |
| **Token 数量** | ≥ 15000 tokens | 接近模型有效上下文的安全线 |
| **任一满足即触发** | — | 两个条件取 OR |

### 10.4 压缩策略

#### 文本消息压缩

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 保留最近 30 条消息 | 约 3-4 轮完整对话，确保当前上下文连贯 |
| 2 | 将更早消息归档 | 存入 `archived_messages` 表（含原文 + 摘要） |
| 3 | 生成阶段性摘要 | 调用总结模型（轻量模型即可）概括被移除消息的要点 |
| 4 | 替换为摘要消息 | 在消息列表开头插入 `SystemMessage(摘要内容)` |
| 5 | 安全切分 | 确保 AI 消息和对应的 ToolMessage 不被拆散 |

#### 多模态（图片）渐进式压缩

| 消息年龄 | 压缩操作 | 说明 |
|---------|---------|------|
| 最近 10 条消息内 | 保持原样 | 当前对话的图片保持清晰 |
| 10-25 条消息前 | 压缩到 400×400, quality=60 | 降低分辨率，保留大致内容 |
| 25-40 条消息前 | 压缩到 200×200, quality=40 | 进一步压缩 |
| 40 条消息之前 | 替换为 `[图片已过期]` 文本 | 完全移除图片，只留文字标记 |

### 10.5 消息清理（在压缩之前）

每次模型调用前自动执行消息清理，修复各种异常情况：

| 清理项 | 处理方式 |
|--------|---------|
| 不完整的工具调用序列 | AI 发起了 tool_call 但没有对应的 ToolMessage → 移除整组 |
| content 格式不一致 | 非视觉模式下，将 list 格式 content 转为纯文本 |
| 非法 content type | 视觉模式下，过滤 type 不在 `{text, image_url, video_url}` 的内容块 |
| 空消息 | 移除 content 为空且无 tool_call 的消息 |

### 10.6 Claude 专用缓存优化

针对 Claude 模型的 Prompt Caching 特性，在中间件中自动：

| 缓存点 | 策略 |
|--------|------|
| 系统提示词 | 添加 `cache_control: ephemeral`，避免每次重传 |
| 工具定义 | 对所有工具定义添加缓存标记 |
| 历史消息 | 对倒数第 2 条和最后 1 条 HumanMessage 打缓存断点（增量缓存） |

---

## 十一、记忆向量混合检索系统

### 11.1 设计目标

AI 需要"长期记忆"——能回忆起几天前、几周前的对话内容。纯 SQLite 只能做精确查询，无法做语义检索（如"上次我们讨论的部署方案"）。需要一个 **向量检索 + 关键词检索** 的混合系统。

### 11.2 混合检索架构

```
用户提问："上次我们讨论的部署方案是什么？"
                    ↓
          ┌────────┴────────┐
          ▼                 ▼
   向量语义检索          关键词精确检索
   (Embedding + FAISS/   (SQLite FTS5
    ChromaDB)             全文搜索)
          │                 │
          ▼                 ▼
    Top-K 语义相似       Top-K 关键词匹配
          │                 │
          └────────┬────────┘
                   ▼
           混合排序 + 去重（RRF 融合算法）
                   ↓
           Top-N 最相关的记忆片段
                   ↓
           注入到当前对话上下文中
```

### 11.3 向量存储设计

| 组件 | 技术选型 | 理由 |
|------|---------|------|
| **Embedding 模型** | 本地小模型（如 `bge-small-zh`）或远程 API | 本地模型无需网络，远程模型效果更好 |
| **向量数据库** | ChromaDB（嵌入式）或 FAISS | 轻量级，无需独立服务，SQLite 后端 |
| **全文搜索** | SQLite FTS5 扩展 | 无需额外依赖，与现有 SQLite 方案统一 |

### 11.4 记忆索引数据源

| 数据源 | 向量化内容 | 更新时机 |
|--------|-----------|---------|
| **对话消息** | 用户消息 + AI 回复的摘要 | 每次对话结束或压缩触发时 |
| **话题摘要** | `topic_summaries` 表的摘要文本 | 每次压缩生成摘要时 |
| **审批记录** | 审批操作的描述和用户备注 | 每次审批完成时 |
| **任务执行结果** | 任务的输入/输出摘要 | 任务完成时 |
| **用户偏好** | 从多次交互中提取的偏好模式 | 定期分析 |

### 11.5 检索融合策略（RRF）

```python
# Reciprocal Rank Fusion（RRF）算法
# 将向量检索和关键词检索的结果融合排序

def reciprocal_rank_fusion(vector_results, keyword_results, k=60):
    """
    vector_results: [(doc_id, score), ...] 按相似度排序
    keyword_results: [(doc_id, score), ...] 按 BM25 排序
    k: 平滑常数（防止排名靠前的结果权重过大）
    """
    fused_scores = {}
    for rank, (doc_id, _) in enumerate(vector_results):
        fused_scores[doc_id] = fused_scores.get(doc_id, 0) + 1.0 / (k + rank + 1)
    for rank, (doc_id, _) in enumerate(keyword_results):
        fused_scores[doc_id] = fused_scores.get(doc_id, 0) + 1.0 / (k + rank + 1)
    return sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)
```

### 11.6 记忆注入流程

```
用户发送新消息
      ↓
提取查询意图（关键词 + 语义向量）
      ↓
混合检索 → 获取 Top-5 相关记忆片段
      ↓
判断相关性（阈值过滤，避免注入噪音）
      ↓
将相关记忆注入到系统提示词中：
"以下是你的长期记忆中与当前对话相关的内容：
 [记忆片段 1]: 2026-03-20 用户讨论了 Docker 部署方案...
 [记忆片段 2]: 2026-03-18 用户偏好使用 Claude 模型..."
      ↓
正常调用大模型
```

### 11.7 数据库扩展

```sql
-- 向量索引元数据表（ChromaDB 内部存储向量，此表存元数据）
CREATE TABLE memory_embeddings (
    id INTEGER PRIMARY KEY,
    source_type TEXT NOT NULL,           -- conversation / summary / approval / task
    source_id TEXT NOT NULL,             -- 关联的记录 ID
    thread_id TEXT,                      -- 所属对话（可选）
    content_text TEXT NOT NULL,          -- 原始文本内容
    content_summary TEXT,                -- 文本摘要（用于展示）
    embedding_id TEXT NOT NULL,          -- ChromaDB 中的向量 ID
    token_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_memory_source ON memory_embeddings(source_type, source_id);

-- SQLite FTS5 全文搜索虚拟表（关键词检索用）
CREATE VIRTUAL TABLE memory_fts USING fts5(
    content_text,                        -- 原始文本
    content_summary,                     -- 摘要
    source_type,                         -- 来源类型
    content='memory_embeddings',         -- 关联实体表
    content_rowid='id'
);
```

---

## 十二、前端交互界面设计

### 12.1 设计目标

用户需要一个可视化界面来：与 AI 对话、审批操作、管理白名单、查看审计日志、观看 VNC 画面。

### 12.2 前端技术选型

| 组件 | 技术选型 | 理由 |
|------|---------|------|
| **框架** | React + Next.js | 生态最好，SSR 支持，适合全栈 |
| **UI 组件** | shadcn/ui + TailwindCSS | 现代、美观、可定制 |
| **图标** | Lucide Icons | 轻量、风格统一 |
| **实时通信** | WebSocket（SSE 降级） | AI 流式输出需要实时推送 |
| **状态管理** | Zustand | 轻量，适合中小型项目 |
| **VNC 嵌入** | noVNC（iframe 嵌入） | 成熟的 Web VNC 客户端 |

### 12.3 核心页面

#### 页面 1：AI 对话主界面

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────────────────────────────────────┐ │
│  │ 对话列表  │  │  对话区域                                │ │
│  │          │  │                                          │ │
│  │ ● 部署方案│  │  👤 帮我分析一下这份日志文件            │ │
│  │ ● 数据分析│  │                                          │ │
│  │ ● 代码审查│  │  🤖 我来分析。首先执行：                │ │
│  │          │  │     $ cat /workspace/app.log | tail -100 │ │
│  │          │  │                                          │ │
│  │ [+ 新对话]│  │  ⚠️ AI 请求执行命令，是否批准？         │ │
│  │          │  │  [✅ 批准]  [❌ 拒绝]  [📝 修改后批准]  │ │
│  │          │  │                                          │ │
│  │          │  │  ───────────────────────────             │ │
│  │          │  │  📎 附件  🔧 模型切换  ⚙️ 设置          │ │
│  │          │  │  [__________________ 输入消息... 发送 ▶] │ │
│  └──────────┘  └──────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**核心功能**：
- 对话列表（左侧栏）：历史对话、搜索、新建/删除
- 流式输出：AI 回复实时显示（SSE/WebSocket）
- 内联审批：高危操作直接在聊天流中弹出审批卡片
- 消息操作：回溯、重新生成、复制、编辑
- 模型切换：下拉菜单切换不同大模型
- 文件上传：支持图片、文档、代码文件

#### 页面 2：审批与审计面板

```
┌──────────────────────────────────────────────────────────────┐
│  待审批 (3)  │  审批历史  │  审计日志  │  网络白名单          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  🔴 高风险 | rm -rf /output/temp/*                          │
│  时间: 2026-03-23 20:30  | 置信度: 0.3                      │
│  [✅ 批准]  [❌ 拒绝]  [🔍 查看上下文]                     │
│                                                              │
│  🟡 中风险 | pip install selenium                           │
│  时间: 2026-03-23 20:28  | 置信度: 0.6                      │
│  [✅ 批准]  [❌ 拒绝]  [📝 总是允许此类操作]               │
│                                                              │
│  🟢 低风险 | curl https://api.example.com/data              │
│  新域名请求: api.example.com                                 │
│  [✅ 本次允许]  [✅ 永久放行]  [❌ 拒绝]                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 页面 3：VNC 观察窗口

```
┌──────────────────────────────────────────────────────────────┐
│  🖥️ AI 浏览器画面（VNC）                      [全屏] [断开] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  (noVNC iframe - 实时浏览器画面)                     │   │
│  │                                                      │   │
│  │  AI 正在操作: https://example.com/dashboard          │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  状态: 🟢 AI 操作中  │  [🖱️ 抢过控制权]  [⏸️ 暂停 AI]     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 页面 4：设置面板

| 设置项 | 说明 |
|--------|------|
| API Key 管理 | 配置各大模型的 API Key（加密存储） |
| 模型配置 | 默认模型、备用模型、模型参数 |
| 授权阶段 | 查看/手动调整当前授权阶段 |
| 安全基线 | 编辑免审批命令白名单 |
| 网络白名单 | 管理永久放行/禁止的域名 |
| 容器配置 | 资源限制、数据卷路径 |
| 备份设置 | 快照频率、保留天数 |

### 12.4 前后端通信协议

#### WebSocket 消息格式

```json
// ===== 用户 → Agent =====
// 发送消息
{
  "type": "message",
  "thread_id": "conv_001",
  "content": "帮我分析日志文件",
  "attachments": []
}

// 审批响应
{
  "type": "approval_response",
  "approval_id": "apr_001",
  "approved": true,
  "comment": "允许执行"
}

// ===== Agent → 用户 =====
// AI 流式输出（逐 token）
{
  "type": "stream_token",
  "thread_id": "conv_001",
  "token": "我来"
}

// AI 执行操作（工具调用）
{
  "type": "tool_call",
  "thread_id": "conv_001",
  "tool": "run_terminal",
  "command": "cat /workspace/app.log | tail -100",
  "status": "running"
}

// 请求审批
{
  "type": "approval_request",
  "approval_id": "apr_001",
  "tool": "run_terminal",
  "command": "rm -rf /output/temp/*",
  "risk_level": "high",
  "confidence": 0.3,
  "reason": "AI 要清理临时文件"
}

// 请求用户介入（ask_user）
{
  "type": "user_intervention",
  "thread_id": "conv_001",
  "reason": "检测到登录页面，需要您输入密码",
  "vnc_url": "https://localhost:6080/vnc.html"
}

// 任务状态变更
{
  "type": "task_status",
  "thread_id": "conv_001",
  "status": "waiting_user",
  "message": "等待您的审批..."
}
```

### 12.5 后端 API 设计（FastAPI，运行在容器内）

| 端点 | 方法 | 功能 |
|------|------|------|
| `/ws/chat/{thread_id}` | WebSocket | 实时对话（流式输出 + 审批推送） |
| `/api/conversations` | GET | 获取对话列表 |
| `/api/conversations` | POST | 创建新对话 |
| `/api/conversations/{id}` | DELETE | 删除对话 |
| `/api/conversations/{id}/messages` | GET | 获取对话历史消息 |
| `/api/conversations/{id}/rollback` | POST | 回溯到指定消息 |
| `/api/approvals/pending` | GET | 获取待审批列表 |
| `/api/approvals/{id}` | POST | 提交审批结果 |
| `/api/audit/logs` | GET | 查询审计日志（支持分页、过滤） |
| `/api/network/whitelist` | GET/POST/DELETE | 管理网络白名单 |
| `/api/settings` | GET/PUT | 读取/更新系统设置 |
| `/api/memory/search` | POST | 混合检索记忆（向量+关键词） |
| `/api/container/status` | GET | 容器状态（CPU/内存/磁盘/进程数） |

---

## 十三、动态模型切换中间件

### 13.1 设计目标

支持用户在对话中随时切换大模型（如 Claude → GPT-4 → Gemini），模型实例使用 LRU 缓存复用。参考现有 AI_JOIN 项目的 `DynamicModelMiddleware` 方案。

### 13.2 模型缓存池

```python
# LRU 缓存池（避免重复创建模型实例）
# 缓存 Key = model_name + api_base + thinking_model
# 最大缓存数 = 20，超出时淘汰最久未用的实例
```

### 13.3 支持的模型提供商

| 提供商 | 模型示例 | SDK |
|--------|---------|-----|
| OpenAI | GPT-4o, GPT-4-turbo | `openai` |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus | `langchain-anthropic` |
| Google | Gemini 1.5 Pro, Gemini 2.0 Flash | `langchain-google-genai` |
| DeepSeek | DeepSeek-Chat, DeepSeek-Reasoner | `langchain-deepseek` |
| 通义千问 | Qwen-Plus, Qwen-Max | 自定义 SDK |
| 智谱 | GLM-4, GLM-4-Plus | `langchain-community` |
| Ollama（本地） | Llama3, Qwen2.5 等 | `langchain-ollama` |

### 13.4 中间件拦截流程

```
用户选择模型 → state["model_name"] = "claude-3-5-sonnet"
                         ↓
DynamicModelMiddleware.awrap_model_call() 拦截
                         ↓
         查 LRU 缓存 → 命中则复用，未命中则创建新实例
                         ↓
         配置工具列表 + 系统提示词（按模式切换）
                         ↓
         消息清理（修复不完整工具调用、格式转换）
                         ↓
         Claude 缓存优化（如果是 Claude 模型）
                         ↓
         调用模型 → 返回结果
```

---

## 十四、任务管理

### 14.1 任务状态机

```
PENDING → RUNNING → WAITING_USER → RUNNING → COMPLETED
                  ↘ FAILED                  ↗
                  ↘ TIMEOUT ───────────────↗
```

| 状态 | 含义 |
|------|------|
| `PENDING` | 任务已创建，等待执行 |
| `RUNNING` | AI 正在执行 |
| `WAITING_USER` | AI 暂停，等待用户介入（审批/登录/验证码等） |
| `COMPLETED` | 任务完成 |
| `FAILED` | 任务失败（重试后仍失败） |
| `TIMEOUT` | 等待用户响应超时（10 分钟） |

### 14.2 错误恢复

- 命令执行失败 → AI 先尝试自行排查修复（看错误输出、换个方式）
- 自行修复失败 → 调用 `ask_user` 请求用户帮助
- 重试仍失败 → 标记为 `FAILED`，保存进度和错误信息
- 长时间任务支持断点信息记录，便于手动恢复

---

## 十五、技术选型

| 组件 | 技术选型 | 理由 |
|------|---------|------|
| **容器运行时** | Docker + Docker Compose | 生态成熟，API 丰富 |
| **基础镜像** | Ubuntu 22.04 LTS | 图形应用兼容性最好 |
| **AI Agent 框架** | LangChain (Python)，运行在容器内 | Agent 框架生态最好，Tool 机制成熟 |
| **大模型** | 远程 API（Claude / GPT-4 / Gemini），容器内调用 | 无需本地 GPU，能力最强 |
| **代理网关** | Squid（宿主机） | 轻量、成熟、支持 ACL 白名单 |
| **审批记忆** | SQLite（容器内持久卷） | 轻量、无需额外服务、嵌入式 |
| **审计日志** | SQLite + 文件日志（容器内 + 同步宿主机） | 可查询 + 可归档 |
| **浏览器自动化** | Playwright（容器内） | 支持 Chromium/Firefox，无头模式 |
| **图形界面**（可选） | Xvfb + Fluxbox + x11vnc + noVNC（容器内） | 轻量级 VNC 方案 |
| **用户交互**（初期） | 命令行 CLI | 最快落地，后续可扩展 Web/Telegram |
| **容器与宿主机通信** | Docker API + 共享卷 + Unix Socket | 审批通知、白名单同步 |
| **向量数据库** | ChromaDB（嵌入式，容器内） | 轻量、SQLite 后端、无需独立服务 |
| **Embedding 模型** | 远程 API（text-embedding-3-small）/ 本地小模型（bge-small-zh） | 远程效果好，本地无网络依赖 |
| **全文搜索** | SQLite FTS5 | 与现有 SQLite 方案统一，无额外依赖 |
| **前端框架** | React + Next.js + TailwindCSS + shadcn/ui | 现代、美观、生态成熟 |
| **实时通信** | WebSocket（SSE 降级） | AI 流式输出 + 审批推送 |
| **后端 API** | FastAPI（容器内） | 异步高性能，原生 WebSocket 支持 |
| **上下文压缩** | 自研中间件（参考 MultimodalSummarizationMiddleware） | 文本摘要 + 图片渐进压缩 |

---

## 十六、开发阶段规划

### Phase 1：最小可用（MVP）

**目标**：跑通核心链路——用户输入指令 → 容器内 AI Agent 调用大模型 → 在容器内执行 → 返回结果

- [ ] 构建 AI 容器基础镜像（Ubuntu 22.04 + Python + Node.js + 核心工具 + LangChain）
- [ ] 搭建 Squid 代理网关 + 白名单配置（含大模型 API 域名）
- [ ] 实现容器内 AI Agent 核心逻辑（接收指令 → 调用大模型 → 执行操作 → 返回结果）
- [ ] 实现 3 个基础 Tool：`run_terminal`、`write_and_run_script`、`ask_user`
- [ ] 实现对话记忆永久存储（AsyncSqliteSaver + Checkpoint）
- [ ] 实现上下文压缩中间件（文本摘要 + 消息清理）
- [ ] 实现动态模型切换中间件（LRU 缓存 + 多模型支持）
- [ ] 实现 CLI 交互界面（用户通过命令行与容器内 AI 对话）
- [ ] 实现宿主机管理脚本（启动/停止容器、查看日志）
- [ ] Docker Compose 一键部署（容器 + Squid）

### Phase 2：审批记忆 + 渐进式授权 + 长期记忆

**目标**：AI 能从审批历史中学习，常见操作自动执行；具备长期记忆检索能力

- [ ] 实现审批记忆库（SQLite）
- [ ] 实现操作指纹提取 + 置信度计算
- [ ] 实现安全基线白名单（只读命令免审批）
- [ ] 实现权限回退机制（错误降级 + 时间衰减）
- [ ] 实现网络动态白名单（AI 请求 → 用户审批 → Squid 配置同步）
- [ ] 实现审计日志同步到宿主机
- [ ] 实现记忆向量混合检索系统（ChromaDB + SQLite FTS5 + RRF 融合）
- [ ] 实现对话消息自动归档 + 话题摘要生成
- [ ] 实现多模态图片渐进式压缩（400×400 → 200×200 → 移除）

### Phase 3：浏览器自动化 + 人机协作

**目标**：AI 能操作浏览器，遇到障碍主动暂停等用户介入

- [ ] 容器内集成 Playwright 浏览器自动化
- [ ] 实现 AI 主动暂停检测（登录、验证码、支付）
- [ ] 实现 VNC 图形界面（Xvfb + Fluxbox + x11vnc + noVNC）
- [ ] 实现任务状态机 + 错误恢复
- [ ] 实现用户通过 VNC 抢过控制权 + 交回控制权

### Phase 3.5：前端交互界面

**目标**：提供完整的 Web 管理界面，替代 CLI

- [ ] 搭建 Next.js + shadcn/ui 前端项目
- [ ] 实现 AI 对话主界面（对话列表 + 流式输出 + 内联审批）
- [ ] 实现 WebSocket 实时通信（流式输出 + 审批推送）
- [ ] 实现审批与审计面板
- [ ] 实现网络白名单管理页
- [ ] 实现设置页（API Key、模型配置、授权阶段、安全基线）
- [ ] 嵌入 noVNC 观察窗口（iframe）

### Phase 4：生态扩展

**目标**：更多入口、更多场景、更好的体验

- [ ] Telegram Bot 入口（手机上与 AI 对话）
- [ ] 多容器支持（不同任务隔离到不同容器）
- [ ] 容器快照 / 恢复（一键回滚到某个时间点）
- [ ] 模型路由（简单任务用小模型，复杂任务用大模型）
- [ ] 用户偏好自动提取与学习

---

## 十七、宿主机系统要求

| 场景 | 推荐方案 |
|------|---------|
| 有 Linux 机器 | Ubuntu 22.04/24.04 桌面版 |
| 用 Windows | Windows 11 + WSL2 + Docker Desktop |
| 用 Mac（无 GPU 需求） | macOS + Docker Desktop |

### 最低配置

- **CPU**：4 核
- **内存**：8GB（宿主机 4GB + 容器 4GB）
- **磁盘**：50GB 可用空间
- **网络**：稳定外网连接（容器通过代理调用远程大模型 API）

---

## 十八、待确认的决策点

| 编号 | 决策点 | 选项 | 当前倾向 |
|------|--------|------|---------|
| D1 | 用户交互入口 | CLI / Web / Telegram Bot | CLI（MVP 最快） |
| D2 | 图形界面 | 先无头模式 / 直接配 VNC | 先无头，Phase 3 加 VNC |
| D3 | 容器生命周期 | 持久容器 / 短命容器+持久卷 | 短命容器+持久卷（避免状态污染） |
| D4 | `--read-only` 兼容性 | 保留+tmpfs / 放弃改用 AppArmor | 保留+多个 tmpfs 挂载点 |
| D5 | 容器与用户通信 | Docker API exec / Unix Socket / 共享文件 | 待 MVP 阶段验证 |
| D6 | 模型选择 | 单模型 / 多模型路由 | 单模型（MVP），后续加路由 |
| D7 | Embedding 模型 | 远程 API / 本地小模型 | 远程 API（效果更好，已有代理网关） |
| D8 | 前端部署位置 | 容器内 / 宿主机 / 独立服务 | 容器内（与 Agent 同容器，简化部署） |

---

## 十九、风险与应对

| 风险 | 严重程度 | 应对措施 |
|------|---------|---------|
| 远程大模型 API 不可用 | 高 | 失败重试 + 备用模型切换 |
| API Key 在容器内泄露 | 中 | 网络白名单限制 + 代理日志监控异常调用 |
| 容器内核漏洞逃逸 | 低概率高影响 | `userns-remap` + `cap-drop ALL` + seccomp + 保持内核更新 |
| 审批疲劳导致用户盲批 | 中 | 安全基线白名单减少审批量 |
| Prompt Injection 攻击 | 中 | 网络白名单限制 AI 能访问的范围 + 审批机制兜底 |
| 代理网关被绕过 | 低 | `--dns none` + 容器网络配置为 internal，物理上无法绕过 |
| 容器崩溃丢失数据 | 低 | 所有重要数据在持久卷中，容器重建即恢复 |

---

## 二十、项目目录结构（预期）

```
opensys/
├── docs/
│   └── PRD.md                        # 本文档
├── docker/
│   ├── Dockerfile                    # AI 容器镜像定义
│   ├── docker-compose.yml            # 一键部署（容器 + Squid）
│   └── squid/
│       ├── squid.conf                # Squid 代理配置
│       └── whitelist.txt             # 默认白名单域名
├── agent/                            # AI Agent 代码（运行在容器内）
│   ├── main.py                       # Agent 入口 + FastAPI 服务
│   ├── tools/
│   │   ├── run_terminal.py           # 终端执行 Tool
│   │   ├── write_and_run.py          # 写脚本并执行 Tool
│   │   └── ask_user.py               # 请求用户介入 Tool
│   ├── middleware/
│   │   ├── dynamic_model.py          # 动态模型切换中间件（LRU 缓存）
│   │   ├── context_compression.py    # 上下文压缩中间件（文本摘要 + 图片渐进压缩）
│   │   └── message_cleaner.py        # 消息清理（修复不完整工具调用、格式转换）
│   ├── memory/
│   │   ├── approval.py               # 审批记忆管理
│   │   ├── fingerprint.py            # 操作指纹提取 + 置信度计算
│   │   ├── vector_store.py           # 向量存储（ChromaDB 封装）
│   │   ├── hybrid_search.py          # 混合检索（向量 + FTS5 + RRF 融合）
│   │   └── conversation_manager.py   # 对话管理（列表、归档、回溯、话题命名）
│   ├── db/
│   │   └── schema.sql                # SQLite 全部表结构
│   ├── api/
│   │   ├── routes.py                 # FastAPI 路由定义
│   │   └── websocket.py              # WebSocket 实时通信
│   └── config/
│       └── settings.py               # 配置（模型选择、阈值、压缩参数等）
├── frontend/                         # 前端代码（Next.js）
│   ├── app/
│   │   ├── page.tsx                  # 对话主界面
│   │   ├── approvals/page.tsx        # 审批与审计面板
│   │   ├── vnc/page.tsx              # VNC 观察窗口
│   │   └── settings/page.tsx         # 设置页
│   ├── components/                   # UI 组件
│   ├── lib/                          # 工具函数、WebSocket 客户端
│   └── package.json
├── host/                             # 宿主机管理脚本
│   ├── manage.sh                     # 启动/停止/查日志
│   └── sync_whitelist.py             # 白名单同步脚本
└── README.md
```
