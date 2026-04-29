import type { SseEvent } from "./types";

/**
 * Mock Agent runner —— 无 ANTHROPIC_API_KEY 时走此脚本
 * 按真实 agent 的节奏编排：推理 → 调用工具 → 推理 → 计划更新 → ...
 */

const SCRIPT: Array<Omit<SseEvent, "id" | "goalId" | "time">> = [
  {
    type: "reasoning",
    content: "扫描过去 14 天小红书头部 5 个竞品账号……",
  },
  {
    type: "tool_call",
    content: "browser.navigate",
    meta: { url: "xhs.com/@alice" },
  },
  {
    type: "tool_call",
    content: "browser.screenshot",
    meta: { target: "alice-profile" },
  },
  {
    type: "reasoning",
    content: "本周受众对『人的故事』反响是技术细节的 3 倍。",
  },
  {
    type: "tool_call",
    content: "mem0.recall",
    meta: { key: "brand_voice" },
  },
  {
    type: "tool_result",
    content: "已加载品牌语气记忆 217 tokens",
  },
  {
    type: "reasoning",
    content: "正在起草 3 条变体，每条 240 字以内，语调冷静偏学术……",
  },
  {
    type: "tool_call",
    content: "image.generate",
    meta: { prompt: "极简主图 · cyan/violet · 夜感" },
  },
  {
    type: "plan_update",
    content: "完成『生成 3 张主视觉（3/3）』",
  },
  {
    type: "approval_needed",
    content: "小红书笔记草稿已就绪 · 等待你审批",
  },
  {
    type: "reasoning",
    content: "正在监听小红书新入站评论与私信……",
  },
  {
    type: "tool_call",
    content: "xhs.search_inbox",
    meta: { since: "1h 前" },
  },
  {
    type: "tool_result",
    content: "发现 7 条新评论 + 2 条私信 · 1 条商单线索已上报",
  },
];

export async function* mockEventStream(
  goalId: string,
  signal: AbortSignal
): AsyncGenerator<SseEvent> {
  let idx = 0;
  let counter = 0;

  while (!signal.aborted) {
    const template = SCRIPT[idx % SCRIPT.length];
    const now = new Date();
    const time = now.toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const event: SseEvent = {
      id: `evt-${counter}`,
      goalId,
      time,
      ...template,
    };

    yield event;

    const delay = 2400 + Math.floor(Math.random() * 1200);
    await new Promise((r) => setTimeout(r, delay));

    idx++;
    counter++;
  }
}
