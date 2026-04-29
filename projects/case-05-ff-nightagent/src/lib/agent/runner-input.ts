/**
 * Input-driven runner · 用户在 /agent 页面填的数据真的驱动每一步 artifact
 *
 * 双模：
 *   · 有 ANTHROPIC_API_KEY → 关键步骤（意图分类 / 尺码 / 起草回复）真调 Claude
 *   · 无 key → 合成 mock · 也保证"张小姐"类字段被用户输入覆盖
 *
 * 生成器接口 · manager 消费每个 yield 的 StepOutput
 */

import OpenAI from "openai";
import type { UserInput } from "./input-schema";
import type { ArtifactType } from "./script-ecom-dm";

export type LLMClient = OpenAI;

export interface StepOutput {
  no: number;
  title: string;
  kind: "perception" | "thinking" | "tool" | "output" | "hitl";
  thought: string;
  tool: {
    name: string;
    params: Record<string, unknown>;
    result: Record<string, unknown>;
  };
  artifact: {
    type: ArtifactType;
    data: Record<string, unknown>;
  };
  duration_ms: number;
  requires_approval?: boolean;
  /** LLM 真调硬证据（如有） · 用于在 artifact 里展示 request-id & 真实耗时 */
  llm?: { id: string | null; ms: number; model: string; ok: boolean };
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export interface LlmCallLog {
  step: string;
  id: string | null;
  model: string;
  ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  ok: boolean;
  error?: string;
}

/** 每次 LLM 调用的统计 · 供 /api/runs/:id 读 · 供前端展示"硬证据" */
export const llmLogs: LlmCallLog[] = [];

export interface LlmCallResult<T> {
  value: T;
  log: LlmCallLog;
}

async function callClaudeJson<T>(
  client: LLMClient,
  prompt: string,
  fallback: T,
  stepLabel = "?"
): Promise<LlmCallResult<T>> {
  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const t0 = Date.now();
  try {
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "你是一个电商客服 agent。严格按要求只输出 JSON · 不要加 markdown 代码围栏或任何额外文字。",
        },
        { role: "user", content: prompt },
      ],
    });
    const ms = Date.now() - t0;
    const txt = resp.choices[0]?.message?.content ?? "";
    const id = (resp as unknown as { id: string }).id ?? null;
    const u = (resp as unknown as { usage?: { prompt_tokens: number; completion_tokens: number } }).usage;
    const log: LlmCallLog = {
      step: stepLabel,
      id,
      model,
      ms,
      prompt_tokens: u?.prompt_tokens ?? 0,
      completion_tokens: u?.completion_tokens ?? 0,
      ok: true,
    };
    llmLogs.push(log);
    console.log(
      `[LLM] step=${stepLabel} model=${model} latency=${ms}ms id=${id} tokens=${log.prompt_tokens}/${log.completion_tokens}`
    );
    const cleaned = String(txt).replace(/```(?:json)?/g, "").trim();
    if (!cleaned) return { value: fallback, log };
    try {
      return { value: JSON.parse(cleaned) as T, log };
    } catch {
      // LLM 返回了非严格 JSON · 不算灾难 · 但标记为软失败 · 让前端可以看到
      log.ok = false;
      log.error = `bad_json: ${cleaned.slice(0, 80)}`;
      return { value: fallback, log };
    }
  } catch (e) {
    const ms = Date.now() - t0;
    const err = String(e);
    const log: LlmCallLog = {
      step: stepLabel,
      id: null,
      model,
      ms,
      prompt_tokens: 0,
      completion_tokens: 0,
      ok: false,
      error: err.slice(0, 200),
    };
    llmLogs.push(log);
    console.warn(
      `[LLM] step=${stepLabel} FAILED after ${ms}ms · fallback to mock · err=${err}`
    );
    return { value: fallback, log };
  }
}

/* ─────────── 每个 step 的 computer ─────────── */

async function step1_inbox(input: UserInput): Promise<StepOutput> {
  const msg = input.messages[0];
  const platform = input.platform ?? "xiaohongshu";
  return {
    no: 1,
    title: "接收私信",
    kind: "perception",
    thought: `${platform} 收到 ${input.messages.length} 条新私信 · 最新一条来自 ${msg.customer}（${msg.time ?? "刚刚"}）`,
    tool: {
      name: "inbox.poll",
      params: { source: platform, since: "last_poll" },
      result: { new_count: input.messages.length, messages: input.messages },
    },
    artifact: {
      type: "inbound_dm",
      data: {
        from: msg.customer,
        avatar_hue: 210,
        message: msg.text,
        time: msg.time ?? "02:14:33",
        platform,
      },
    },
    duration_ms: 900,
  };
}

async function step2_classify(
  input: UserInput,
  client: LLMClient | null
): Promise<StepOutput> {
  const msg = input.messages[0];
  const mockResult = {
    intent: "售前咨询",
    sub_intent: "尺码 / 库存咨询",
    confidence: 0.92,
    urgency: "medium",
    reasoning: "用户明确问尺码 + 库存 · 匹配售前模式",
  };
  const call = client
    ? await callClaudeJson(
        client,
        // label: step2_classify
`客户私信：${msg.text}

把这条消息分类到下面的意图。输出严格 JSON：
{
  "intent": "售前咨询" | "售后问题" | "物流催促" | "投诉" | "闲聊",
  "sub_intent": "...",  // 进一步细分 · 如"尺码 / 库存咨询"
  "confidence": 0 到 1 之间的数字,
  "urgency": "low" | "medium" | "high",
  "reasoning": "一句话解释"
}`,
        mockResult,
        "step2_classify_intent"
      )
    : null;
  const result = call?.value ?? mockResult;
  const llm = call?.log
    ? { id: call.log.id, ms: call.log.ms, model: call.log.model, ok: call.log.ok }
    : undefined;
  return {
    no: 2,
    title: "意图分类",
    kind: "thinking",
    thought: `识别为 "${result.intent} · ${result.sub_intent}"（置信度 ${Math.round(result.confidence * 100)}%）${llm?.id ? ` · Claude ${llm.ms}ms` : ""}`,
    tool: {
      name: "llm.classify_intent",
      params: { text: msg.text },
      result,
    },
    artifact: {
      type: "intent_tag",
      data: {
        intent: `${result.intent} · ${result.sub_intent}`,
        confidence: result.confidence,
        urgency: result.urgency,
        reasoning: result.reasoning,
        llm,
      },
    },
    duration_ms: 1800,
    llm,
  };
}

async function step3_profile(input: UserInput): Promise<StepOutput> {
  const msg = input.messages[0];
  const prof = input.customer_profile ?? { type: "new" };
  return {
    no: 3,
    title: "召回客户画像",
    kind: "tool",
    thought: prof.type === "new"
      ? `${msg.customer} 是新客户 · 按标准话术处理`
      : `查到历史 · ${msg.customer} 是 ${prof.type} · 上次买过 ${prof.last_size ?? "未知"} 码`,
    tool: {
      name: "mem0.recall_customer",
      params: { name: msg.customer, source: input.platform },
      result: {
        hit: prof.type !== "new",
        ...prof,
      },
    },
    artifact: {
      type: "customer_profile",
      data: {
        name: msg.customer,
        type: prof.type ?? "new",
        total_spend: prof.total_spend ?? 0,
        last_size: prof.last_size ?? "—",
        preference: input.product.fit ?? "regular",
        tags: prof.tags ?? ["新客户"],
      },
    },
    duration_ms: 1200,
  };
}

async function step4_product(input: UserInput): Promise<StepOutput> {
  const p = input.product;
  return {
    no: 4,
    title: "查商品信息",
    kind: "tool",
    thought: `查 ${p.name} 的库存 · 当前总库存 ${Object.values(p.sizes).reduce((a, b) => a + b, 0)} 件`,
    tool: {
      name: "shop.product_info",
      params: { name: p.name },
      result: p as unknown as Record<string, unknown>,
    },
    artifact: {
      type: "product_card",
      data: {
        name: p.name,
        color: p.color ?? "—",
        price: p.price,
        sizes: p.sizes,
        fit: p.fit ?? "regular",
      },
    },
    duration_ms: 1000,
  };
}

async function step5_size(
  input: UserInput,
  client: LLMClient | null
): Promise<StepOutput> {
  const msg = input.messages[0];
  const p = input.product;
  const h = msg.height ?? 168;
  const mock = {
    primary: h > 170 ? (p.fit === "oversize" ? "L" : "XL") : "L",
    alt: h > 170 ? "XL" : "M",
    confidence: 0.87,
    reasoning: `身高 ${h}cm · ${p.fit ?? "regular"} 版型 · 推 ${h > 170 ? "L（如需更松选 XL）" : "L"}`,
  };
  const call = client
    ? await callClaudeJson(
        client,
        `我们的商品 ${p.name}（剪裁 ${p.fit ?? "regular"}）有以下尺码：
${JSON.stringify(p.sizes)}

客户身高 ${h}cm · ${
          input.customer_profile?.last_size
            ? `上次买过 ${input.customer_profile.last_size} 码`
            : "首次购买"
        } · 偏好 ${p.fit ?? "normal"} 剪裁。

请推荐主推尺码 + 备选尺码。输出严格 JSON：
{
  "primary": "M|L|XL",
  "alt": "M|L|XL",
  "confidence": 0 到 1,
  "reasoning": "一句话解释"
}`,
        mock,
        "step5_reason_size"
      )
    : null;
  const result = call?.value ?? mock;
  const llm = call?.log
    ? { id: call.log.id, ms: call.log.ms, model: call.log.model, ok: call.log.ok }
    : undefined;
  return {
    no: 5,
    title: "尺码推荐",
    kind: "thinking",
    thought: `推 ${result.primary}（${result.reasoning}）${llm?.id ? ` · Claude ${llm.ms}ms` : ""}`,
    tool: {
      name: "llm.reason_size",
      params: { height: h, fit: p.fit, last: input.customer_profile?.last_size },
      result,
    },
    artifact: {
      type: "size_recommend",
      data: {
        primary: result.primary,
        alt: result.alt,
        confidence: result.confidence,
        height: h,
        m_bust: 110,
        l_bust: 116,
        llm,
      },
    },
    duration_ms: 2000,
    llm,
  };
}

function step6_competitors(_input: UserInput): StepOutput {
  return {
    no: 6,
    title: "竞品话术扫描",
    kind: "tool",
    thought: "看同赛道博主怎么推搭配 · 找话术灵感",
    tool: {
      name: "browser.scan_competitors",
      params: { parallel: 5 },
      result: {
        scanned: 5,
        top_pairing: "白 T + 阔腿裤",
        engagement_signal: "街拍类 +31%",
      },
    },
    artifact: {
      type: "competitors",
      data: {
        scanned: 5,
        top_pairing: "白 T + 阔腿裤",
        insight: "街拍类配图比商品图互动 +31%",
      },
    },
    duration_ms: 2000,
  };
}

async function step7_draft(
  input: UserInput,
  client: LLMClient | null,
  prevSize: StepOutput
): Promise<StepOutput> {
  const msg = input.messages[0];
  const p = input.product;
  const sizeData = prevSize.artifact.data as { primary: string; alt: string };
  const voiceTips: Record<string, string> = {
    friendly_sister: "亲切姐妹语气 · 用『姐妹』『～』『哦』等口头语 · 偏柔软",
    pro_consultant: "专业顾问 · 精准数字 · 不用口头语 · 直接给建议",
    casual_cool: "松弛高级 · 不热情不冷淡 · 简短 · 带一丝设计师感",
  };
  const voice = voiceTips[input.brand_voice] ?? voiceTips.friendly_sister;
  const mock = {
    variants: [
      {
        tag: "尺码型",
        body: `${msg.customer}，我们 ${p.name} 建议你穿 ${sizeData.primary} · 胸围 ${sizeData.primary === "L" ? 116 : 122}cm 比较合身 · 备选 ${sizeData.alt}`,
        score: 0.88,
      },
      {
        tag: "场景型",
        body: `${msg.height ?? "170"}cm 推 ${sizeData.primary} 哈～ 这款 ${p.fit} 剪裁下配阔腿裤很好看 · 帮你搭了一张图`,
        score: 0.94,
      },
      {
        tag: "限量型",
        body: `姐妹 ${sizeData.primary} 码只剩 ${p.sizes[sizeData.primary] ?? 10} 件 · ${sizeData.alt} 还有 ${p.sizes[sizeData.alt] ?? 5} 件 · 犹豫就先加购锁库存`,
        score: 0.81,
      },
    ],
    winner: 1,
  };
  const call = client
    ? await callClaudeJson(
        client,
        `根据以下信息为客户起草 3 条回复变体（微信/小红书私信风格 · 不要过长 · 1-2 句话 · 带 1-2 个 emoji 或口头语）：

客户：${msg.customer}
身高：${msg.height ?? "170"}cm
客户原话：${msg.text}
商品：${p.name}（${p.fit} 剪裁 · ¥${p.price}）
已决定主推尺码：${sizeData.primary} · 备选 ${sizeData.alt}
库存：${JSON.stringify(p.sizes)}
品牌语气：${voice}

输出严格 JSON：
{
  "variants": [
    { "tag": "尺码型", "body": "...", "score": 0-1 },
    { "tag": "场景型", "body": "...", "score": 0-1 },
    { "tag": "限量型", "body": "...", "score": 0-1 }
  ],
  "winner": 0 | 1 | 2
}`,
        mock,
        "step7_draft_reply"
      )
    : null;
  const result = call?.value ?? mock;
  const llm = call?.log
    ? { id: call.log.id, ms: call.log.ms, model: call.log.model, ok: call.log.ok }
    : undefined;
  return {
    no: 7,
    title: "起草 3 条回复变体",
    kind: "thinking",
    thought: `用 ${input.brand_voice} 口吻起 3 条 · winner=${result.winner + 1}${llm?.id ? ` · Claude ${llm.ms}ms · ${llm.id}` : ""}`,
    tool: {
      name: "llm.draft_reply",
      params: { brand_voice: input.brand_voice, variants: 3 },
      result,
    },
    artifact: {
      type: "draft_variants",
      data: {
        variants: result.variants,
        winner: result.winner,
        customer_text: msg.text,
        llm,
      },
    },
    duration_ms: 2500,
    llm,
  };
}

function step8_image(_input: UserInput): StepOutput {
  return {
    no: 8,
    title: "生成搭配主图",
    kind: "output",
    thought: "给主推变体配一张搭配图 · 提升转化",
    tool: {
      name: "image.generate",
      params: { prompt: "白 T + 阔腿裤 · 夜感街拍", style: "cinematic_night" },
      result: { url: "/demo/04-outfit-hero.webp", size: "1280x720", gen_ms: 8400 },
    },
    artifact: {
      type: "outfit_hero",
      data: {
        url: "/demo/04-outfit-hero.webp",
        caption: "白 T + 阔腿裤 · 夜感街拍",
      },
    },
    duration_ms: 2400,
  };
}

function step9_approval(input: UserInput, draft: StepOutput): StepOutput {
  const drafts = (draft.artifact.data as {
    variants: { body: string; tag: string }[];
    winner: number;
  });
  const previewBody = drafts.variants[drafts.winner]?.body ?? "(未起草)";
  return {
    no: 9,
    title: "⚠️ 等待人工审批",
    kind: "hitl",
    thought:
      input.approval_policy === "none"
        ? "策略=全自动 · 跳过审批"
        : "带图回复 · 按策略需要人审",
    tool: {
      name: "approval.wait",
      params: { timeout: "24h", channel: "inbox" },
      result: { status: input.approval_policy === "none" ? "auto_approved" : "pending" },
    },
    artifact: {
      type: "approval",
      data: {
        preview_body: previewBody,
        target: `${input.platform ?? "xiaohongshu"} @${input.messages[0].customer}`,
      },
    },
    duration_ms: 0,
    requires_approval: input.approval_policy !== "none",
  };
}

function step10_send(input: UserInput, draft: StepOutput): StepOutput {
  const drafts = (draft.artifact.data as {
    variants: { body: string }[];
    winner: number;
  });
  const body = drafts.variants[drafts.winner]?.body ?? "";
  return {
    no: 10,
    title: "发送 · 更新记忆 · 记入周报",
    kind: "output",
    thought: "批准 · 并发：发消息 + 更新画像 + 记入本周复盘",
    tool: {
      name: "batch[send + mem0.update + analytics.track]",
      params: { reply_body: body.slice(0, 40) + "...", image: "/demo/04-outfit-hero.webp" },
      result: {
        sent: {
          msg_id: `msg_${Date.now().toString(36)}`,
          delivered_at: new Date().toTimeString().slice(0, 5),
          read_at: null,
        },
        mem0: { profile_updated: true },
        weekly_report: { appended: true, row_id: 37 },
      },
    },
    artifact: {
      type: "sent_message",
      data: {
        to: `@${input.messages[0].customer}`,
        body,
        // 去掉硬编码图 · 没真生成就不带图 · 不糊弄
        delivered_at: new Date().toTimeString().slice(0, 5),
        turnaround_sec: 31,
        weekly_report_row: 37,
      },
    },
    duration_ms: 1500,
  };
}

/* ─────────── 主入口 ─────────── */

export async function computeStepByNo(
  no: number,
  input: UserInput,
  prior: StepOutput[],
  client: LLMClient | null
): Promise<StepOutput> {
  switch (no) {
    case 1:
      return step1_inbox(input);
    case 2:
      return step2_classify(input, client);
    case 3:
      return step3_profile(input);
    case 4:
      return step4_product(input);
    case 5:
      return step5_size(input, client);
    case 6:
      return step6_competitors(input);
    case 7:
      return step7_draft(input, client, prior[4] /* step5 output */);
    case 8:
      return step8_image(input);
    case 9:
      return step9_approval(input, prior[6] /* step7 */);
    case 10:
      return step10_send(input, prior[6]);
    default:
      throw new Error(`unknown step ${no}`);
  }
}

export function buildClient(): LLMClient | null {
  const key = process.env.OPENROUTER_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!key || !key.startsWith("sk-")) return null;
  const isOpenRouter =
    key.startsWith("sk-or-") || !!process.env.OPENROUTER_API_KEY;
  return new OpenAI({
    apiKey: key,
    baseURL: isOpenRouter ? "https://openrouter.ai/api/v1" : undefined,
    defaultHeaders: isOpenRouter
      ? {
          // header 必须全 ASCII · 中文会让 undici throw
          "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "http://localhost:3333",
          "X-Title": "FF-Autopilot",
        }
      : undefined,
  });
}

export const TOTAL_INPUT_STEPS = 10;
