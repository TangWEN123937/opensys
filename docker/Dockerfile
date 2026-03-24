# ==================== OpenSys AI Agent 容器镜像 ====================
# 基础镜像：Ubuntu 22.04 LTS（图形应用兼容性最好）
# 包含：Python 3.11+、Node.js 20、常用开发工具

FROM ubuntu:22.04

# 避免交互式安装提示
ENV DEBIAN_FRONTEND=noninteractive
# Python 不缓冲输出
ENV PYTHONUNBUFFERED=1
# 设置时区
ENV TZ=Asia/Shanghai

# --- 系统依赖 ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Python 相关
    python3.11 python3.11-venv python3-pip python3.11-dev \
    # Node.js（用于前端构建和脚本执行）
    curl \
    # 常用工具（AI Agent 可能需要）
    git wget vim nano tree htop \
    jq bc file unzip zip \
    # 网络工具
    net-tools iputils-ping dnsutils \
    # 编译依赖（部分 pip 包需要）
    build-essential \
    # 清理缓存
    && rm -rf /var/lib/apt/lists/*

# --- 安装 Node.js 20 ---
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# --- 设置 Python 默认版本 ---
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

# --- 创建工作目录 ---
WORKDIR /app

# --- 安装 Python 依赖 ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- 复制 Agent 代码 ---
COPY agent/ ./agent/
COPY .env.example ./.env.example

# --- 数据卷挂载点 ---
# /app/data  — 持久化数据（SQLite、审批记忆、审计日志）
# /workspace — 用户工作目录（只读挂载）
VOLUME ["/app/data", "/workspace"]

# --- 环境变量 ---
ENV OPENSYS_DATA_DIR=/app/data

# --- 暴露端口 ---
# 8000: FastAPI 服务
EXPOSE 8000

# --- 启动命令 ---
# 默认启动 FastAPI 服务
CMD ["python", "-m", "agent", "server", "--host", "0.0.0.0", "--port", "8000"]
