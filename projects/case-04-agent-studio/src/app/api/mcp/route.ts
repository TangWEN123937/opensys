// GET /api/mcp · 列 MCP servers · 静态 registry + 安装状态
// POST /api/mcp · { action: "install" | "uninstall", name }

import { readCollection, writeCollection } from "@/server/store";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MCPServer {
  id: string;
  name: string;
  author: string;
  registry: "smithery" | "glama" | "official";
  description: string;
  tools: number;
  resources: number;
  prompts: number;
}

// 静态 registry · MVP 不真调 Smithery API
const REGISTRY: MCPServer[] = [
  { id: "filesystem", name: "@modelcontextprotocol/filesystem", author: "official", registry: "official", description: "Read/write local files · sandbox 受限", tools: 8, resources: 1, prompts: 0 },
  { id: "brave-search", name: "@modelcontextprotocol/brave-search", author: "official", registry: "official", description: "Brave Search API · 2K free/月", tools: 2, resources: 0, prompts: 0 },
  { id: "github", name: "@modelcontextprotocol/github", author: "official", registry: "official", description: "GitHub API · 仓库/PR/issue 全面", tools: 16, resources: 4, prompts: 2 },
  { id: "slack", name: "@slack/mcp-slack", author: "slack", registry: "smithery", description: "Slack messages / channels / users", tools: 10, resources: 2, prompts: 0 },
  { id: "postgres", name: "@mcp/postgres", author: "community", registry: "glama", description: "SQL 查询 · schema 发现 · 读写可控", tools: 6, resources: 3, prompts: 1 },
  { id: "sentry", name: "@sentry/mcp-sentry", author: "sentry", registry: "smithery", description: "Sentry 错误监控 · 事件查询", tools: 4, resources: 1, prompts: 0 },
  { id: "memory-graph", name: "@mcp/memory-graph", author: "community", registry: "smithery", description: "持久化知识图谱 · 长期记忆", tools: 6, resources: 2, prompts: 1 },
  { id: "puppeteer", name: "@mcp/puppeteer", author: "community", registry: "glama", description: "无头浏览器 · 爬取 · 截图 · 表单填写", tools: 8, resources: 0, prompts: 2 },
  { id: "gmail", name: "@google/mcp-gmail", author: "community", registry: "smithery", description: "Gmail 读取 · 发送 · label 管理", tools: 12, resources: 2, prompts: 3 },
  { id: "notion", name: "@mcp/notion", author: "community", registry: "smithery", description: "Notion 页面 / 数据库 / block CRUD", tools: 14, resources: 4, prompts: 1 },
];

interface McpState {
  installed: string[];
}

export async function GET() {
  const state = await readCollection<McpState>("mcp-installed", { installed: ["filesystem", "brave-search", "github"] });
  // MVP · 每次随机给个 latency/status 假装健康检查
  const servers = REGISTRY.map((s) => {
    const isInstalled = state.installed.includes(s.id);
    return {
      ...s,
      installed: isInstalled,
      status: isInstalled ? (Math.random() > 0.1 ? "healthy" : "degraded") : "off",
      latency: isInstalled ? Math.round(50 + Math.random() * 400) : 0,
      calls: isInstalled ? Math.round(Math.random() * 1500) : 0,
    };
  });
  return Response.json({ servers });
}

export async function POST(req: Request) {
  const { action, name } = (await req.json()) as { action: "install" | "uninstall"; name: string };
  const state = await readCollection<McpState>("mcp-installed", { installed: [] });
  if (action === "install" && !state.installed.includes(name)) state.installed.push(name);
  else if (action === "uninstall") state.installed = state.installed.filter((x) => x !== name);
  await writeCollection("mcp-installed", state);
  await audit({ actor: "user", action: `mcp.${action}`, target: name });
  return Response.json({ ok: true, installed: state.installed });
}
