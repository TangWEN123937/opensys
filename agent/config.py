"""
OpenSys 全局配置模块

集中管理所有配置项，包括模型、安全、审批、网络等参数。
通过环境变量覆盖默认值，支持 .env 文件加载。
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

# ==================== 路径配置 ====================

# 项目根目录（agent/ 的上一级）
PROJECT_ROOT = Path(__file__).parent.parent

# 数据目录（Docker 持久卷挂载点）
DATA_DIR = Path(os.getenv("OPENSYS_DATA_DIR", PROJECT_ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# SQLite 数据库路径
DB_PATH = DATA_DIR / "opensys.db"

# 记忆文档路径（存储用户偏好/习惯/项目上下文，注入 system prompt）
MEMORY_FILE = DATA_DIR / "memory.md"

# 记忆文档最大字符数（超过此值 AI 应主动精简）
MEMORY_MAX_CHARS = int(os.getenv("OPENSYS_MEMORY_MAX_CHARS", "3000"))

# 用户自定义提示词文件（追加到 system prompt，AI 不可修改，用户可编辑）
USER_PROMPT_FILE = DATA_DIR / "user_prompt.md"

# 审计日志目录
LOG_DIR = DATA_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ==================== 模型配置 ====================

# 默认模型名称（必须是 MODEL_PRESETS 中的 key）
DEFAULT_MODEL_NAME = os.getenv("OPENSYS_MODEL_NAME", "deepseek-chat")

# 按 model_name 预设完整配置（参考 AI_JOIN AgentConfigManager.PRESET_CONFIGS）
# 每个模型名对应：provider、api_key、api_base、thinking_model、isvision
# 同一 provider 下不同模型可能有不同的 api_base 和特性
MODEL_PRESETS = {
    # --- DeepSeek ---
    "deepseek-chat": {
        "model_name": "deepseek-chat",
        "model_provider": "deepseek",
        "api_key": os.getenv("OPENSYS_DEEPSEEK_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_DEEPSEEK_API_BASE", ""),
        "thinking_model": None,
        "isvision": None,
    },
    "deepseek-reasoner": {
        "model_name": "deepseek-reasoner",
        "model_provider": "deepseek",
        "api_key": os.getenv("OPENSYS_DEEPSEEK_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_DEEPSEEK_API_BASE", "https://api.deepseek.com"),
        "thinking_model": None,  # reasoner 模型默认开启思考
        "isvision": None,
    },

    # --- 通义千问 (Qwen) ---
    "qwen3.5-plus": {
        "model_name": "qwen3.5-plus",
        "model_provider": "qwen",
        "api_key": os.getenv("OPENSYS_QWEN_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_QWEN_API_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        "thinking_model": False,
        "isvision": True,
    },
    "qwen3.5-plus-Think": {
        "model_name": "qwen3.5-plus",
        "model_provider": "qwen",
        "api_key": os.getenv("OPENSYS_QWEN_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_QWEN_API_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        "thinking_model": True,  # 思考版本
        "isvision": True,
    },
    "qwen3-coder-plus": {
        "model_name": "qwen3-coder-plus",
        "model_provider": "qwen",
        "api_key": os.getenv("OPENSYS_QWEN_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_QWEN_API_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        "thinking_model": False,
        "isvision": False,
    },

    # --- Claude (Anthropic) ---
    "claude-sonnet-4-6": {
        "model_name": "claude-sonnet-4-6",
        "model_provider": "anthropic",
        "api_key": os.getenv("OPENSYS_ANTHROPIC_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_ANTHROPIC_API_BASE", ""),
        "thinking_model": None,
        "isvision": True,
    },
    "claude-haiku-4-5": {
        "model_name": "claude-haiku-4-5",
        "model_provider": "anthropic",
        "api_key": os.getenv("OPENSYS_ANTHROPIC_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_ANTHROPIC_API_BASE", ""),
        "thinking_model": None,
        "isvision": True,
    },

    # --- Google (Gemini) ---
    "gemini-3-flash-preview": {
        "model_name": "gemini-3-flash-preview",
        "model_provider": "google_genai",
        "api_key": os.getenv("OPENSYS_GOOGLE_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_GOOGLE_API_BASE", ""),
        "thinking_model": None,
        "isvision": True,
    },

    # --- Kimi ---
    "kimi-k2.5": {
        "model_name": "kimi-k2.5",
        "model_provider": "openai",
        "api_key": os.getenv("OPENSYS_DASHSCOPE_API_KEY", ""),
        "api_base": "https://coding.dashscope.aliyuncs.com/v1",
        "thinking_model": False,
        "isvision": True,
    },

    # --- MiniMax ---
    "MiniMax-M2.5": {
        "model_name": "MiniMax-M2.5",
        "model_provider": "openai",
        "api_key": os.getenv("OPENSYS_DASHSCOPE_API_KEY", ""),
        "api_base": "https://coding.dashscope.aliyuncs.com/v1",
        "thinking_model": False,
        "isvision": False,
    },
    "MiniMax-M2.7": {
        "model_name": "MiniMax-M2.7",
        "model_provider": "openai",
        "api_key": os.getenv("OPENSYS_MINIMAX_API_KEY", ""),
        "api_base": "https://api.minimaxi.com/v1",
        "thinking_model": False,
        "isvision": False,
    },

    # --- 智谱 (GLM) ---
    "glm-5": {
        "model_name": "glm-5",
        "model_provider": "zhipu",
        "api_key": os.getenv("OPENSYS_ZHIPU_API_KEY", ""),
        "api_base": "https://open.bigmodel.cn/api/paas/v4/",
        "thinking_model": None,
        "isvision": False,
    },

    # --- Ollama（本地模型） ---
    "ollama-qwen3.5:9b": {
        "model_name": "qwen3.5:9b",
        "model_provider": "ollama",
        "api_key": "",
        "api_base": os.getenv("OPENSYS_OLLAMA_API_BASE", "http://localhost:11434"),
        "thinking_model": None,
        "isvision": True,
    },
}

# 默认模型的完整配置
_default_preset = MODEL_PRESETS.get(DEFAULT_MODEL_NAME, {})
DEFAULT_MODEL_PROVIDER = _default_preset.get("model_provider", "deepseek")
DEFAULT_API_KEY = _default_preset.get("api_key", "")
DEFAULT_API_BASE = _default_preset.get("api_base", "")

# 模型参数
DEFAULT_TEMPERATURE = float(os.getenv("OPENSYS_TEMPERATURE", "0.7"))
DEFAULT_MAX_TOKENS = int(os.getenv("OPENSYS_MAX_TOKENS", "4096"))

# 速率限制
MAX_REQUESTS_PER_SECOND = int(os.getenv("OPENSYS_MAX_RPS", "5"))
RATE_LIMITER_CHECK_INTERVAL = float(os.getenv("OPENSYS_RATE_CHECK_INTERVAL", "1.0"))
RATE_LIMITER_BUCKET_SIZE = int(os.getenv("OPENSYS_RATE_BUCKET_SIZE", "30"))

# 重试策略
MAX_RETRY_ATTEMPTS = int(os.getenv("OPENSYS_MAX_RETRY", "3"))

# ==================== 安全与授权配置 ====================

# 授权等级
class AuthLevel:
    """渐进式授权等级"""
    OBSERVER = 0       # 观察者：只能查看，不能执行
    RESTRICTED = 1     # 受限：只读命令免审批，其他全部审批
    STANDARD = 2       # 标准：安全基线内免审批，危险操作需审批
    TRUSTED = 3        # 信任：大部分操作免审批，仅高危操作需确认
    AUTONOMOUS = 4     # 自主：几乎全部自动，仅特殊场景通知

# 默认授权等级
DEFAULT_AUTH_LEVEL = int(os.getenv("OPENSYS_AUTH_LEVEL", str(AuthLevel.RESTRICTED)))

# 审批超时（秒）
APPROVAL_TIMEOUT = int(os.getenv("OPENSYS_APPROVAL_TIMEOUT", "600"))  # 10 分钟

# 安全基线：免审批的只读命令前缀
SAFE_COMMAND_PREFIXES = [
    "ls", "cat", "head", "tail", "wc", "grep", "find", "which", "whoami",
    "pwd", "date", "echo", "env", "printenv", "df", "du", "free",
    "uname", "hostname", "id", "file", "stat", "readlink",
    "python --version", "python3 --version", "pip list", "pip show",
    "node --version", "npm --version", "git status", "git log", "git diff",
]

# 高危命令关键词（始终需要审批，不受授权等级影响）
DANGEROUS_COMMAND_KEYWORDS = [
    "rm -rf", "mkfs", "dd if=", "chmod 777", "curl | sh", "wget | sh",
    "eval", "> /dev/", "shutdown", "reboot", "kill -9",
    "DROP TABLE", "DELETE FROM", "TRUNCATE",
]

# ==================== 网络配置 ====================

# 代理网关地址（Squid，运行在宿主机）
PROXY_HOST = os.getenv("OPENSYS_PROXY_HOST", "host.docker.internal")
PROXY_PORT = int(os.getenv("OPENSYS_PROXY_PORT", "3128"))
PROXY_URL = f"http://{PROXY_HOST}:{PROXY_PORT}"

# ==================== 服务配置 ====================

# FastAPI 服务
API_HOST = os.getenv("OPENSYS_API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("OPENSYS_API_PORT", "8000"))

# WebSocket 配置
WS_HEARTBEAT_INTERVAL = int(os.getenv("OPENSYS_WS_HEARTBEAT", "30"))  # 秒

# ==================== 上下文压缩配置 ====================

# 消息数量触发阈值
COMPRESS_TRIGGER_MESSAGES = int(os.getenv("OPENSYS_COMPRESS_MSG_TRIGGER", "60"))
# Token 数量触发阈值
COMPRESS_TRIGGER_TOKENS = int(os.getenv("OPENSYS_COMPRESS_TOKEN_TRIGGER", "15000"))
# 压缩后保留的消息数量
COMPRESS_KEEP_MESSAGES = int(os.getenv("OPENSYS_COMPRESS_KEEP_MSG", "30"))

# ==================== 向量数据库配置（ChromaDB） ====================

# ChromaDB 持久化目录
CHROMA_DB_DIR = DATA_DIR / "chroma_db"
CHROMA_DB_DIR.mkdir(parents=True, exist_ok=True)

# ChromaDB 集合名称
CHROMA_COLLECTION_CONVERSATIONS = "conversation_memory"  # 对话记忆集合
CHROMA_COLLECTION_SCRIPTS = "script_knowledge"            # 脚本知识库集合

# 本地 Embedding 服务配置（BGE-M3）
EMBEDDING_API_URL = os.getenv("OPENSYS_EMBEDDING_URL", "http://localhost:8100/api/v1/embed")
EMBEDDING_MODEL_NAME = os.getenv("OPENSYS_EMBEDDING_MODEL", "bge-code-v1")

# 对话记忆向量化配置
VECTOR_TRIGGER_MESSAGES = int(os.getenv("OPENSYS_VECTOR_MSG_TRIGGER", "60"))    # 触发入库的消息数阈值
VECTOR_TRIGGER_TOKENS = int(os.getenv("OPENSYS_VECTOR_TOKEN_TRIGGER", "15000")) # 触发入库的 token 阈值
VECTOR_KEEP_MESSAGES = int(os.getenv("OPENSYS_VECTOR_KEEP_MSG", "30"))          # 入库后保留的最近消息数
VECTOR_SEARCH_TOP_K = int(os.getenv("OPENSYS_VECTOR_TOP_K", "5"))              # 检索返回的 top-k 数量

# 脚本知识库配置
SCRIPT_SIMILARITY_THRESHOLD = float(os.getenv("OPENSYS_SCRIPT_SIM_THRESHOLD", "0.85"))  # 脚本去重相似度阈值
SCRIPTS_DIR = DATA_DIR / "scripts"  # 持久化脚本存储目录（每个脚本配一个 .txt 说明文件）
SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

# ==================== 调试配置 ====================

DEBUG = os.getenv("OPENSYS_DEBUG", "false").lower() == "true"
