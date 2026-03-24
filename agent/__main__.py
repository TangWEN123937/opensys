"""
OpenSys Agent 入口

支持两种启动模式：
    python -m agent cli              # CLI 交互模式
    python -m agent cli --list       # 列出对话
    python -m agent cli -t <id>      # 继续对话
    python -m agent server           # 启动 FastAPI 服务
    python -m agent server --port 8000
"""

import sys
import argparse


def main():
    parser = argparse.ArgumentParser(description="OpenSys AI Agent")
    subparsers = parser.add_subparsers(dest="command", help="启动模式")

    # CLI 模式
    cli_parser = subparsers.add_parser("cli", help="命令行交互模式")
    cli_parser.add_argument("--thread", "-t", type=str, default=None, help="继续指定的对话线程")
    cli_parser.add_argument("--list", "-l", action="store_true", help="列出所有对话")

    # Server 模式
    server_parser = subparsers.add_parser("server", help="启动 FastAPI 服务")
    server_parser.add_argument("--host", type=str, default="0.0.0.0", help="监听地址")
    server_parser.add_argument("--port", "-p", type=int, default=8000, help="监听端口")
    server_parser.add_argument("--reload", action="store_true", help="开发模式（热重载）")

    args = parser.parse_args()

    if args.command == "cli":
        from .cli import run
        # 将参数传递给 CLI
        sys.argv = ["agent"]  # 重置 argv
        if args.thread:
            sys.argv.extend(["--thread", args.thread])
        if args.list:
            sys.argv.append("--list")
        run()

    elif args.command == "server":
        import uvicorn
        from . import config

        host = args.host or config.API_HOST
        port = args.port or config.API_PORT

        print(f"🚀 启动 OpenSys Agent 服务: http://{host}:{port}")
        print(f"   API 文档: http://{host}:{port}/docs")

        uvicorn.run(
            "agent.api.app:app",
            host=host,
            port=port,
            reload=args.reload,
            log_level="info",
        )

    else:
        parser.print_help()
        print("\n示例:")
        print("  python -m agent cli            # 命令行对话")
        print("  python -m agent server         # 启动 API 服务")
        print("  python -m agent cli --list     # 列出对话")


if __name__ == "__main__":
    main()
