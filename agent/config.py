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

# 任务输出根目录（每次 pipeline 在此下创建独立子目录）
OUTPUT_DIR = Path(os.getenv("OPENSYS_OUTPUT_DIR", PROJECT_ROOT / "output"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 审计日志目录
LOG_DIR = DATA_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)


def get_task_dir(task_name: str = "") -> Path:
    """
    为一次 pipeline 任务创建独立的输出目录

    目录结构：output/YYYYMMDD_HHMM_标题摘要/
      ├── output/      # 终稿交付物（论文终稿、最终文章等）
      ├── drafts/      # 过程草稿和中间文件（分章节草稿、调研笔记等）
      └── downloads/   # 浏览器下载的文件（PDF 等）

    Args:
        task_name: 任务标题摘要（自动截取前 20 字符，清理非法字符）

    Returns:
        任务根目录 Path
    """
    import re
    from datetime import datetime

    # 时间戳前缀
    ts = datetime.now().strftime("%Y%m%d_%H%M")

    # 清理标题：去掉路径非法字符，截取前 20 字符
    clean_name = re.sub(r'[\\/:*?"<>|\s]+', '_', task_name).strip('_')[:20]
    if clean_name:
        dir_name = f"{ts}_{clean_name}"
    else:
        dir_name = ts

    task_dir = OUTPUT_DIR / dir_name
    # 创建子目录
    (task_dir / "output").mkdir(parents=True, exist_ok=True)      # 终稿交付物
    (task_dir / "drafts").mkdir(parents=True, exist_ok=True)      # 过程草稿和中间文件
    (task_dir / "downloads").mkdir(parents=True, exist_ok=True)   # 浏览器下载的文件
    return task_dir

# ==================== 模型配置 ====================

# 默认模型名称（必须是 MODEL_PRESETS 中的 key）
DEFAULT_MODEL_NAME = os.getenv("OPENSYS_MODEL_NAME", "deepseek-v4-flash")

# 按 model_name 预设完整配置（参考 AI_JOIN AgentConfigManager.PRESET_CONFIGS）
# 每个模型名对应：provider、api_key、api_base、thinking_model、isvision
# 同一 provider 下不同模型可能有不同的 api_base 和特性
MODEL_PRESETS = {
    # --- DeepSeek ---
    "deepseek-v4-flash": {
        "model_name": "deepseek-v4-flash",
        "model_provider": "deepseek",
        "api_key": os.getenv("OPENSYS_DEEPSEEK_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_DEEPSEEK_API_BASE", ""),
        "thinking_model": True,  # 推理模式，使用自定义 DeepSeekReasonerChatModel
        "isvision": None,
    },
    "deepseek-v4-pro": {
        "model_name": "deepseek-v4-pro",
        "model_provider": "deepseek",
        "api_key": os.getenv("OPENSYS_DEEPSEEK_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_DEEPSEEK_API_BASE", "https://api.deepseek.com"),
        "thinking_model": True,  # 推理模式，使用自定义 DeepSeekReasonerChatModel
        "isvision": None,
    },

    # --- 通义千问 (Qwen) ---
    "qwen3.6-plus": {
        "model_name": "qwen3.6-plus",
        "model_provider": "qwen",
        "api_key": os.getenv("OPENSYS_QWEN_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_QWEN_API_BASE", "https://coding.caolele.top/v1"),
        "thinking_model": False,
        "isvision": True,
    },

    "qwen3.5-plus": {
        "model_name": "qwen3.5-plus",
        "model_provider": "qwen",
        "api_key": os.getenv("OPENSYS_QWEN_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_QWEN_API_BASE", "https://coding.caolele.top/v1"),
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

    # --- openAI ---
    "gpt-5.5": {
        "model_name": "gpt-5.5",
        "model_provider": "openai",
        "api_key": os.getenv("OPENSYS_OPENAI_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_OPENAI_API_BASE", "https://api.openai.com/v1"),
        "thinking_model": None,
        "isvision": True,
    },
    # --- Claude (Anthropic，通过 WindsurfAPI 代理) ---
    # base_url 应为代理根地址（如 http://127.0.0.1:3003），SDK 会自动拼接 /v1/messages
    "claude-opus-4.6": {
        "model_name": "claude-opus-4.6",          # 代理端注册的模型名（带点号）
        "model_provider": "anthropic",
        "api_key": os.getenv("OPENSYS_ANTHROPIC_API_KEY", ""),
        "api_base": os.getenv("OPENSYS_ANTHROPIC_API_BASE", ""),
        "thinking_model": None,
        "isvision": True,
    },
    "claude-opus-4-7-medium": {
        "model_name": "claude-opus-4-7-medium",            # 代理端注册的模型名（带点号）
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
    "glm-5.1": {
        "model_name": "glm-5.1",
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
COMPRESS_TRIGGER_MESSAGES = int(os.getenv("OPENSYS_COMPRESS_MSG_TRIGGER", "90"))
# Token 数量触发阈值
COMPRESS_TRIGGER_TOKENS = int(os.getenv("OPENSYS_COMPRESS_TOKEN_TRIGGER", "20000"))
# 压缩后保留的消息数量
COMPRESS_KEEP_MESSAGES = int(os.getenv("OPENSYS_COMPRESS_KEEP_MSG", "30"))

# ==================== 向量数据库配置（ChromaDB） ====================

# ChromaDB 持久化目录
CHROMA_DB_DIR = DATA_DIR / "chroma_db"
CHROMA_DB_DIR.mkdir(parents=True, exist_ok=True)

# ChromaDB 集合名称
CHROMA_COLLECTION_CONVERSATIONS = "conversation_memory"  # 对话记忆集合
CHROMA_COLLECTION_DOCUMENTS = "documents"                 # 文档知识库集合（PDF 向量化入库）

# ==================== PDF 向量化配置 ====================

# OCR 解析后的 Markdown 文档存储目录（按 topic 子目录分类）
DOCUMENTS_DIR = DATA_DIR / "documents"
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

# SiliconFlow PaddleOCR-VL 配置（免费，OpenAI 兼容格式，直接解析 PDF → Markdown）
# 模型限速：RPM 1000 / TPM 80000
OCR_API_KEY = os.getenv("SILICONFLOW_API_KEY", "")
OCR_API_BASE = os.getenv("SILICONFLOW_API_BASE", "https://api.siliconflow.cn/v1")
OCR_MODEL = os.getenv("SILICONFLOW_OCR_MODEL", "PaddlePaddle/PaddleOCR-VL-1.5")
# 单次 OCR 请求超时（秒），大 PDF 可能需要较长时间
OCR_TIMEOUT = int(os.getenv("SILICONFLOW_OCR_TIMEOUT", "120"))

# LLM 自动分类使用的模型（Tier 2，topic 分类不需要强模型）
PDF_CLASSIFY_MODEL = os.getenv("OPENSYS_PDF_CLASSIFY_MODEL", "deepseek-v4-flash")

# Markdown chunk 切分参数
PDF_CHUNK_MAX_CHARS = int(os.getenv("OPENSYS_PDF_CHUNK_MAX_CHARS", "1500"))       # 单个 chunk 最大字符数
PDF_CHUNK_OVERLAP_CHARS = int(os.getenv("OPENSYS_PDF_CHUNK_OVERLAP_CHARS", "150")) # 相邻 chunk 重叠字符数

# 文档向量检索 top-k
DOCUMENTS_SEARCH_TOP_K = int(os.getenv("OPENSYS_DOCUMENTS_TOP_K", "10"))

# 本地 Embedding 服务配置（BGE-M3）
EMBEDDING_API_URL = os.getenv("OPENSYS_EMBEDDING_URL", "http://host.docker.internal:8100/api/v1/embed")
EMBEDDING_MODEL_NAME = os.getenv("OPENSYS_EMBEDDING_MODEL", "BAAI/bge-m3")

# 对话记忆向量化配置
VECTOR_TRIGGER_MESSAGES = int(os.getenv("OPENSYS_VECTOR_MSG_TRIGGER", "90"))    # 触发入库的消息数阈值
VECTOR_TRIGGER_TOKENS = int(os.getenv("OPENSYS_VECTOR_TOKEN_TRIGGER", "20000")) # 触发入库的 token 阈值
VECTOR_KEEP_MESSAGES = int(os.getenv("OPENSYS_VECTOR_KEEP_MSG", "30"))          # 入库后保留的最近消息数
VECTOR_SEARCH_TOP_K = int(os.getenv("OPENSYS_VECTOR_TOP_K", "5"))              # 检索返回的 top-k 数量

# ==================== 权限与项目声明配置 ====================

# 声明式权限配置文件（与 security.py 硬编码规则并行生效）
PERMISSIONS_FILE = DATA_DIR / "permissions.yaml"

# 项目声明文件（用户维护，注入 system prompt 提供项目背景）
PROJECT_FILE = DATA_DIR / "project.md"

# Workflow 模板目录（Advisor 从中选择匹配的工作流模板）
WORKFLOWS_DIR = DATA_DIR / "workflows"
WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)

# ==================== 技能系统配置 ====================

# 技能文件目录（每个子目录为一个技能，包含 SKILL.md 主文件）
SKILLS_DIR = DATA_DIR / "skills"
SKILLS_DIR.mkdir(parents=True, exist_ok=True)

# 技能加载策略：始终加载的核心技能列表（目录名），空列表表示全部按需加载
SKILLS_ALWAYS_LOAD = os.getenv("OPENSYS_SKILLS_ALWAYS_LOAD", "").split(",")
SKILLS_ALWAYS_LOAD = [s.strip() for s in SKILLS_ALWAYS_LOAD if s.strip()]

# 技能内容注入 system prompt 的最大总字符数（防止 prompt 过长）
SKILLS_MAX_CHARS = int(os.getenv("OPENSYS_SKILLS_MAX_CHARS", "8000"))

# ==================== P3 多代理流水线配置 ====================

# Executor ↔ Reviewer 返工上限（同一阶段返工超过此次数 → escalate 到主代理）
EXECUTOR_MAX_REWORK = int(os.getenv("OPENSYS_EXECUTOR_MAX_REWORK", "2"))

# Advisor 单次会话最大调用次数（超过此次数 → 拒绝继续规划）
ADVISOR_MAX_CALLS_PER_SESSION = int(os.getenv("OPENSYS_ADVISOR_MAX_CALLS", "5"))

# Pipeline 模式下 agent 单阶段最大工具调用轮次（超过 → 强制结束当前阶段交给 phase_done）
AGENT_PHASE_MAX_TOOL_ROUNDS = int(os.getenv("OPENSYS_AGENT_PHASE_MAX_TOOL_ROUNDS", "8"))

# 同一阶段被路由的最大次数（超过 → 强制跳过或 escalate）
MAX_PHASE_ATTEMPTS = int(os.getenv("OPENSYS_MAX_PHASE_ATTEMPTS", "5"))

# LangGraph 全局递归上限（所有节点访问总次数）
RECURSION_LIMIT = int(os.getenv("OPENSYS_RECURSION_LIMIT", "100"))

# 无人值守模式全局超时（秒），定时任务超过此时间强制终止（默认 15 分钟）
UNATTENDED_TIMEOUT_SECONDS = int(os.getenv("OPENSYS_UNATTENDED_TIMEOUT", "900"))

# 无人值守模式最大自动处理 interrupt 次数（超过此次数强制终止 pipeline，防止死循环）
UNATTENDED_MAX_AUTO_INTERRUPTS = int(os.getenv("OPENSYS_UNATTENDED_MAX_INTERRUPTS", "10"))

# Executor 使用的小模型（Tier 2，执行类任务用便宜快速的模型）
EXECUTOR_MODEL_NAME = os.getenv("OPENSYS_EXECUTOR_MODEL", "deepseek-v4-flash")

# Dispatcher 使用的模型（Tier 2，子任务拆分）
DISPATCHER_MODEL_NAME = os.getenv("OPENSYS_DISPATCHER_MODEL", "deepseek-v4-flash")

# Reviewer 使用的模型（Tier 2，质量审查）
REVIEWER_MODEL_NAME = os.getenv("OPENSYS_REVIEWER_MODEL", "deepseek-v4-flash")

# 最强模型名称（Tier 1，用于 Advisor 规划等高复杂度场景）
COMPLEX_MODEL_NAME = os.getenv("OPENSYS_COMPLEX_MODEL", "claude-sonnet-4-6")

# Advisor 使用的模型（Tier 1，规划用最强模型；默认使用 COMPLEX_MODEL_NAME）
ADVISOR_MODEL_NAME = os.getenv("OPENSYS_ADVISOR_MODEL", "")

# ==================== Web 工具配置 ====================

# Tavily 搜索 API Key（轻量搜索 + 网页提取）
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# Tavily 搜索返回结果数
WEB_SEARCH_MAX_RESULTS = int(os.getenv("OPENSYS_WEB_SEARCH_MAX_RESULTS", "5"))

# 需要浏览器交互的关键词（代码层路由：命中任一关键词 → 走 Browser-Use）
WEB_TOOL_BROWSE_KEYWORDS = [
    # 中文关键词
    "登录", "注册", "填写", "提交表单", "下单", "购买", "支付",
    "点击", "操作网页", "下载文件", "上传文件", "扫码",
    # 英文关键词
    "login", "sign in", "register", "sign up", "submit",
    "checkout", "purchase", "click", "fill form", "upload", "download file",
]

# 浏览器单次任务超时（秒）
WEB_BROWSE_TIMEOUT = int(os.getenv("OPENSYS_WEB_BROWSE_TIMEOUT", "180"))

# Browser-Use 浏览器 Agent 配置
# 默认 non-headless（配合 noVNC 可实时查看/操作浏览器）
BROWSER_HEADLESS = os.getenv("OPENSYS_BROWSER_HEADLESS", "false").lower() == "true"
BROWSER_MAX_STEPS = int(os.getenv("OPENSYS_BROWSER_MAX_STEPS", "30"))
# 步骤用尽但任务未完成时，自动续行的最大次数（在同一个 BrowserSession 上创建新 Agent 继续执行）
BROWSER_MAX_CONTINUATIONS = int(os.getenv("OPENSYS_BROWSER_MAX_CONTINUATIONS", "1"))
# 浏览器用户数据持久化目录（保留 Cookie/登录状态，避免每次重新登录）
BROWSER_USER_DATA_DIR = str(DATA_DIR / "browser_data")
# 浏览器下载文件保存目录（位于持久卷内，确保容器重启不丢失，其他节点可通过路径读取）
BROWSER_DOWNLOADS_DIR = str(Path(os.getenv("OPENSYS_BROWSER_DOWNLOADS_DIR", str(DATA_DIR / "downloads"))))
Path(BROWSER_DOWNLOADS_DIR).mkdir(parents=True, exist_ok=True)
# 浏览器 Agent 使用的 LLM（需要支持视觉的模型效果最佳，默认复用主模型）
BROWSER_MODEL_NAME = os.getenv("OPENSYS_BROWSER_MODEL", DEFAULT_MODEL_NAME)

# noVNC 远程桌面配置
NOVNC_PORT = int(os.getenv("OPENSYS_NOVNC_PORT", "6080"))
# noVNC 访问地址（用于 ask_user 提示用户打开浏览器操作）
NOVNC_URL = os.getenv("OPENSYS_NOVNC_URL", f"http://localhost:{NOVNC_PORT}/vnc.html")

# ==================== 调试配置 ====================

DEBUG = os.getenv("OPENSYS_DEBUG", "false").lower() == "true"
