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

# --- 替换 apt 源为清华 tuna 镜像（国内加速）---
RUN sed -i 's@//.*archive.ubuntu.com@//mirrors.tuna.tsinghua.edu.cn@g' /etc/apt/sources.list \
    && sed -i 's@//.*security.ubuntu.com@//mirrors.tuna.tsinghua.edu.cn@g' /etc/apt/sources.list

# --- 系统依赖 ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Python 相关
    python3.11 python3.11-venv python3-pip python3.11-dev \
    # Node.js（用于前端构建和脚本执行）
    curl \
    # 常用工具（AI Agent 可能需要）
    git wget vim nano tree htop \
    jq bc file unzip zip \
    # 文档格式转换（Markdown/HTML → docx，微信公众号文章导入需要）
    pandoc \
    # PDF 处理依赖（PyMuPDF 渲染 PDF 页面为图像需要）
    libgl1-mesa-glx libglib2.0-0 libmagic1 \
    # 网络工具
    net-tools iputils-ping dnsutils \
    # GUI / VNC 远程桌面（noVNC 方案，支持浏览器实时查看 + 人工操作验证码）
    xvfb x11vnc novnc websockify supervisor \
    # cron 定时任务（支持定时触发 Agent 执行任务）
    cron \
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

# --- 配置 pip 使用清华源加速 ---
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple \
    && pip config set global.trusted-host pypi.tuna.tsinghua.edu.cn

# --- 安装 Python 依赖 ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- 安装 Playwright Chromium 浏览器 + 系统依赖（Browser-Use 需要） ---
RUN playwright install --with-deps chromium

# --- 复制 Agent 代码 ---
COPY agent/ ./agent/
COPY .env.example ./.env.example

# --- 数据卷挂载点 ---
# /app/data  — 持久化数据（SQLite、审批记忆、审计日志）
# /workspace — 用户工作目录（只读挂载）
VOLUME ["/app/data", "/workspace"]

# --- 环境变量 ---
ENV OPENSYS_DATA_DIR=/app/data
# Browser-Use 在 Docker 中运行时需要此环境变量
ENV IN_DOCKER=True
# Xvfb 虚拟显示器（浏览器 non-headless 模式需要）
ENV DISPLAY=:99

# --- 复制 supervisord 配置 ---
COPY docker/supervisord.conf /etc/supervisor/conf.d/opensys.conf

# --- 复制容器入口脚本（启动时自动修复挂载目录权限） ---
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# --- 暴露端口 ---
# 8000: FastAPI 服务
# 6080: noVNC Web 客户端（浏览器远程桌面）
EXPOSE 8000 6080

# --- 启动命令 ---
# entrypoint.sh：修复挂载目录权限 → 启动 supervisord
CMD ["/app/entrypoint.sh"]
