# OpenSys — 渐进式授权 AI Agent 系统

> AI Agent 运行在隔离的 Docker 容器内，通过代理网关访问外网，所有操作受审批机制管控。

## 🏗️ 架构概览

```
宿主机                              Docker 容器（隔离环境）
┌────────────┐                    ┌──────────────────────────┐
│ manage.sh  │    Docker API      │  LangGraph Agent         │
│ (管理脚本)  │ ──────────────── → │  ├── run_terminal        │
│            │                    │  ├── write_and_run_script │
│ Squid 代理 │ ← 白名单出站流量 ── │  └── ask_user            │
│ (网络网关)  │                    │                          │
└────────────┘                    │  FastAPI + WebSocket      │
                                  │  SQLite (记忆 + 审计)     │
                                  └──────────────────────────┘
```

## 🚀 快速开始

### 1. 本地开发（不用 Docker）

```bash
# 安装依赖
cd opensys
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key

# CLI 交互模式
python -m agent cli

# 启动 API 服务
python -m agent server
```

### 2. Docker 部署（推荐）

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env

# 一键启动
./host/manage.sh start

# CLI 对话
./host/manage.sh cli

# 查看日志
./host/manage.sh logs

# 停止
./host/manage.sh stop
```

## 📁 项目结构

```
opensys/
├── agent/                    # AI Agent 核心代码
│   ├── __main__.py           # 入口（CLI / Server）
│   ├── graph.py              # LangGraph 核心图（节点 + 路由）
│   ├── state.py              # Agent 状态定义
│   ├── security.py           # 安全评估（风险判定 + 审批逻辑）
│   ├── config.py             # 全局配置
│   ├── cli.py                # CLI 交互界面
│   ├── tools/                # 3 个基础工具
│   │   ├── run_terminal.py
│   │   ├── write_and_run_script.py
│   │   └── ask_user.py
│   ├── db/                   # 数据库（SQLite）
│   │   ├── schema.sql        # 表结构
│   │   └── manager.py        # CRUD 操作
│   └── api/                  # FastAPI 服务
│       └── app.py            # HTTP + WebSocket 接口
├── docker/                   # 容器化配置
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── squid/                # 代理网关配置
├── host/                     # 宿主机管理脚本
│   └── manage.sh
├── docs/
│   └── PRD.md                # 需求文档
├── requirements.txt
├── .env.example
└── README.md
```

## 🔐 安全设计

### 渐进式授权（4 级）

| 等级 | 名称 | 行为 |
|------|------|------|
| 0 | 观察者 | 只能对话，不能执行任何命令 |
| 1 | 受限 | 只读命令免审批，其他全审批 |
| 2 | 标准 | 安全基线内免审批，危险操作审批 |
| 3 | 信任 | 大部分免审批，仅高危确认 |
| 4 | 自主 | 几乎全自动，特殊场景通知 |

### 审批流程

```
AI 请求执行命令 → 风险评估 → safe?
                               ├─ 是 → 直接执行
                               └─ 否 → 暂停等待用户审批
                                         ├─ ✅ 批准 → 执行
                                         ├─ ✏️ 修改 → 执行修改版
                                         └─ ❌ 拒绝 → 通知 AI
```

## 📡 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat` | 发送消息（SSE 流式输出） |
| POST | `/chat/approve` | 提交审批结果 |
| GET | `/conversations` | 获取对话列表 |
| GET | `/conversations/{id}/history` | 获取对话历史 |
| DELETE | `/conversations/{id}` | 删除对话 |
| GET | `/health` | 健康检查 |
| WS | `/ws/{thread_id}` | WebSocket 实时对话 |

## 🛠️ 技术栈

- **Agent 框架**: LangGraph（支持多 Agent、条件路由、interrupt 审批）
- **大模型**: DeepSeek / Claude / GPT-4 / Gemini（远程 API，容器内调用）
- **数据持久化**: SQLite（对话记忆 + 审批历史 + 审计日志）
- **Web 服务**: FastAPI + WebSocket
- **容器化**: Docker + Docker Compose
- **网络管控**: Squid 代理（出站白名单）
