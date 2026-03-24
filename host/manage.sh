#!/bin/bash
# ==================== OpenSys 宿主机管理脚本 ====================
# 用法:
#   ./manage.sh start    — 启动 Agent + Squid
#   ./manage.sh stop     — 停止所有服务
#   ./manage.sh restart  — 重启
#   ./manage.sh logs     — 查看 Agent 日志
#   ./manage.sh shell    — 进入 Agent 容器 Shell
#   ./manage.sh cli      — 在容器内启动 CLI 对话
#   ./manage.sh status   — 查看服务状态

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_DIR/docker"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

case "${1:-help}" in
    start)
        echo -e "${GREEN}🚀 启动 OpenSys...${NC}"
        cd "$DOCKER_DIR"
        docker compose up -d --build
        echo -e "${GREEN}✅ 启动完成${NC}"
        echo -e "   API 文档: http://localhost:${OPENSYS_API_PORT:-8010}/docs"
        echo -e "   CLI 对话: $0 cli"
        ;;
    stop)
        echo -e "${YELLOW}🔴 停止 OpenSys...${NC}"
        cd "$DOCKER_DIR"
        docker compose down
        echo -e "${GREEN}✅ 已停止${NC}"
        ;;
    restart)
        echo -e "${YELLOW}🔄 重启 OpenSys...${NC}"
        cd "$DOCKER_DIR"
        docker compose down
        docker compose up -d --build
        echo -e "${GREEN}✅ 重启完成${NC}"
        ;;
    logs)
        cd "$DOCKER_DIR"
        docker compose logs -f agent
        ;;
    squid-logs)
        cd "$DOCKER_DIR"
        docker compose logs -f squid
        ;;
    shell)
        echo -e "${GREEN}🐚 进入 Agent 容器...${NC}"
        docker exec -it opensys-agent /bin/bash
        ;;
    cli)
        echo -e "${GREEN}💬 启动 CLI 对话...${NC}"
        docker exec -it opensys-agent python -m agent cli "${@:2}"
        ;;
    status)
        echo -e "${GREEN}📊 OpenSys 服务状态:${NC}"
        cd "$DOCKER_DIR"
        docker compose ps
        ;;
    help|*)
        echo "OpenSys 管理脚本"
        echo ""
        echo "用法: $0 <命令>"
        echo ""
        echo "命令:"
        echo "  start       启动 Agent + Squid 代理"
        echo "  stop        停止所有服务"
        echo "  restart     重启所有服务"
        echo "  logs        查看 Agent 日志（实时）"
        echo "  squid-logs  查看 Squid 代理日志"
        echo "  shell       进入 Agent 容器 Shell"
        echo "  cli         在容器内启动 CLI 对话"
        echo "  status      查看服务状态"
        ;;
esac
