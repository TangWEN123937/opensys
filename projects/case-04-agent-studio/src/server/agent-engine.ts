// MVP · Agent 执行引擎 · ReAct 循环每步完整中间数据 + Skill 3 层渐进披露
// 不做优化 · 跑通为准

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chat } from "./openrouter";
import { audit } from "./audit";
import { appendJsonl } from "./store";

export type Pattern = "react" | "plan-execute" | "reflexion" | "multi-agent" | "swarm";

export interface SpanEvent {
  type:
    | "run_start"
    | "run_end"
    | "error"
    // ReAct 精细事件(渐进中间数据)
    | "react_iter_start"     // 一轮 ReAct 循环开始
    | "thought"               // 思考(流式 chunk)
    | "thought_done"          // 思考完成(full text)
    | "action_chosen"         // 选定 action + args(JSON)
    | "tool_call_start"       // 工具开始执行
    | "tool_call_end"         // 工具返回结果(原文)
    | "observation"           // observation 汇总交给下一轮
    // Skill 3 层渐进披露(按需加载)
    | "skill_discovered"      // Level 1 · 只加载 frontmatter(name + description)
    | "skill_body_loaded"     // Level 2 · body 被读入 prompt
    | "skill_script_invoked"  // Level 3 · 触发 script/template 执行
    // 通用
    | "llm_token"             // 最终答案流式 token
    | "answer_done";          // 最终答案完整
  id?: string;
  iter?: number;
  thought?: string;
  delta?: string;             // 流式 chunk
  full?: string;              // 完整文本
  action?: string;
  args?: Record<string, unknown>;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  toolMs?: number;
  skillName?: string;
  skillMeta?: { name: string; description: string; version: string };
  skillBody?: string;
  skillScript?: string;       // 被调用的 script 文件
  runId?: string;
  pattern?: Pattern;
  totalMs?: number;
  tokens?: number;
  message?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// 读真 .skills/*/SKILL.md · 解析 frontmatter · 按需返回不同层级
async function loadSkill(name: string): Promise<{
  meta: { name: string; description: string; version: string } | null;
  body: string;
  assets: string[];
}> {
  const dir = join(process.cwd(), ".skills", name);
  const mdPath = join(dir, "SKILL.md");
  if (!existsSync(mdPath)) return { meta: null, body: "", assets: [] };

  const raw = await readFile(mdPath, "utf-8");
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  let meta: { name: string; description: string; version: string } | null = null;
  let body = raw;
  if (fmMatch) {
    body = raw.slice(fmMatch[0].length).trim();
    const fm: Record<string, string> = {};
    for (const line of fmMatch[1].split("\n")) {
      const kv = line.match(/^(\w+):\s*(.+)$/);
      if (kv) fm[kv[1]] = kv[2];
    }
    meta = {
      name: fm.name ?? name,
      description: fm.description ?? "",
      version: fm.version ?? "0.0.0",
    };
  }
  const assets: string[] = [];
  try {
    for (const entry of await readdir(dir)) {
      if (entry !== "SKILL.md") assets.push(entry);
    }
  } catch {}
  return { meta, body, assets };
}

// MVP 的 mock tool · 返回有意义的 observation 文本(不是占位)
async function runTool(name: string, input: Record<string, unknown>): Promise<{ result: string; ms: number }> {
  const t0 = Date.now();
  try {
    if (name === "web_search") {
      const q = String(input.query ?? "");
      const r = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
      );
      const j = await r.json();
      const abstract = j.AbstractText || "(no abstract)";
      const related = (j.RelatedTopics ?? []).slice(0, 3).map((t: { Text?: string }) => t.Text).filter(Boolean);
      return {
        result: `search("${q}") → ${abstract}\nRelated: ${related.join(" | ")}`,
        ms: Date.now() - t0,
      };
    }
    if (name === "calc") {
      const expr = String(input.expr ?? "");
      if (!/^[\d+\-*/%.() ]+$/.test(expr)) throw new Error("非法表达式");
      const v = Function(`"use strict"; return (${expr});`)();
      return { result: `calc("${expr}") = ${v}`, ms: Date.now() - t0 };
    }
    if (name === "read_skill_script") {
      const skill = String(input.skill ?? "");
      const file = String(input.file ?? "");
      const p = join(process.cwd(), ".skills", skill, file);
      if (!existsSync(p)) return { result: `(no script at ${file})`, ms: Date.now() - t0 };
      const txt = await readFile(p, "utf-8");
      return { result: `read(.skills/${skill}/${file}) → ${txt.slice(0, 400)}`, ms: Date.now() - t0 };
    }
  } catch (e) {
    return { result: `[error] ${(e as Error).message}`, ms: Date.now() - t0 };
  }
  return { result: `[mock ${name}] unimplemented · returning placeholder`, ms: Date.now() - t0 };
}

export async function* runAgent(opts: {
  pattern: Pattern;
  query: string;
  maxIter?: number;
  useSkill?: string;
}): AsyncGenerator<SpanEvent> {
  const runId = `run_${uid()}`;
  const t0 = Date.now();
  yield { type: "run_start", runId, pattern: opts.pattern };
  await audit({ actor: "system", action: "agent.run.start", target: runId, meta: `pattern:${opts.pattern} · q:${opts.query.slice(0, 40)}` });

  try {
    if (opts.pattern === "react") {
      yield* reactLoop(opts);
    } else if (opts.pattern === "plan-execute") {
      yield* planExecute(opts);
    } else {
      yield* reflexion(opts);
    }

    yield { type: "run_end", runId, totalMs: Date.now() - t0 };
    await audit({ actor: "system", action: "agent.run.done", target: runId, meta: `ms:${Date.now() - t0}` });
  } catch (e) {
    yield { type: "error", message: (e as Error).message };
    await audit({ actor: "system", action: "agent.run.error", target: runId, meta: (e as Error).message, level: "error" });
  }

  await appendJsonl("traces", { runId, pattern: opts.pattern, query: opts.query, totalMs: Date.now() - t0 });
}

// ============ ReAct 循环 · 每步完整中间数据 ============
async function* reactLoop(opts: {
  query: string;
  maxIter?: number;
  useSkill?: string;
}): AsyncGenerator<SpanEvent> {
  const maxIter = opts.maxIter ?? 2;
  let observation = "(空 · 第一轮)";
  let history = "";

  // 如果指定 skill · 先做 Level 1 披露
  let skillBody = "";
  let skillAssets: string[] = [];
  if (opts.useSkill) {
    const { meta, body, assets } = await loadSkill(opts.useSkill);
    if (meta) {
      yield { type: "skill_discovered", skillName: opts.useSkill, skillMeta: meta };
      await new Promise((r) => setTimeout(r, 300));
      // Level 2 · 触发读 body
      yield { type: "skill_body_loaded", skillName: opts.useSkill, skillBody: body.slice(0, 500) };
      skillBody = body;
      skillAssets = assets;
    }
  }

  const tools = ["web_search", "calc"];
  if (skillAssets.length > 0) tools.push("read_skill_script");

  for (let i = 0; i < maxIter; i++) {
    yield { type: "react_iter_start", iter: i + 1 };

    // --- Thought ---
    const systemPrompt = [
      "You are a ReAct agent. Follow this format strictly:",
      "Thought: <reason about what to do next>",
      "Action: <tool name>",
      "ActionInput: <JSON args for the tool>",
      "",
      "Available tools: " + tools.join(", "),
      skillBody ? `\nActive Skill:\n${skillBody.slice(0, 600)}` : "",
      i > 0 ? `\nLast observation: ${observation}` : "",
    ].join("\n");

    const thoughtR = await chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Query: ${opts.query}\n\nHistory:\n${history || "(none)"}` },
      ],
      { max_tokens: 260, temperature: 0.5 },
    );
    const fullThought = thoughtR?.content ?? "Thought: (mock · no key)\nAction: web_search\nActionInput: {\"query\":\"" + opts.query + "\"}";
    // 流式"假装" · 把完整文本切字符 yield
    const thoughtPart = fullThought.match(/Thought:\s*([\s\S]*?)(?=\nAction:|$)/)?.[1]?.trim() ?? fullThought;
    for (const ch of thoughtPart) {
      yield { type: "thought", delta: ch, iter: i + 1 };
    }
    yield { type: "thought_done", full: thoughtPart, iter: i + 1 };

    // --- Action ---
    const actionMatch = fullThought.match(/Action:\s*(\w+)\s*\nActionInput:\s*({[\s\S]*?})/);
    let toolName = "web_search";
    let toolArgs: Record<string, unknown> = { query: opts.query };
    if (actionMatch) {
      toolName = actionMatch[1].trim();
      try { toolArgs = JSON.parse(actionMatch[2]); } catch {}
    }
    yield { type: "action_chosen", action: toolName, args: toolArgs, iter: i + 1 };
    await new Promise((r) => setTimeout(r, 150));

    // --- Tool call · 如需读 skill script · 先披露 Level 3 ---
    if (toolName === "read_skill_script" && opts.useSkill && skillAssets.includes(String(toolArgs.file ?? ""))) {
      yield {
        type: "skill_script_invoked",
        skillName: opts.useSkill,
        skillScript: String(toolArgs.file),
        iter: i + 1,
      };
      await new Promise((r) => setTimeout(r, 250));
    }

    yield { type: "tool_call_start", toolName, toolInput: toolArgs, iter: i + 1 };
    const toolR = await runTool(toolName, toolArgs);
    yield {
      type: "tool_call_end",
      toolName,
      toolInput: toolArgs,
      toolOutput: toolR.result,
      toolMs: toolR.ms,
      iter: i + 1,
    };

    // --- Observation 汇总 ---
    observation = toolR.result;
    yield { type: "observation", full: observation, iter: i + 1 };

    history += `\n[Iter ${i + 1}]\nThought: ${thoughtPart}\nAction: ${toolName}(${JSON.stringify(toolArgs)})\nObservation: ${observation.slice(0, 200)}\n`;

    // 简单退出:第一轮的 web_search / calc 有结果就收敛
    if (toolR.result && !/\[error\]|unimplemented|no abstract/.test(toolR.result)) break;
  }

  // --- Final answer · 流式 ---
  const finalR = await chat(
    [
      { role: "system", content: "Given ReAct trace, answer the user's question concisely in Chinese. 2-3 sentences." },
      { role: "user", content: `Query: ${opts.query}\n\nTrace:\n${history}` },
    ],
    { max_tokens: 400 },
  );
  const content = finalR?.content ?? "基于 ReAct 推理 · 暂无 LLM key · 这是 mock 回答。";
  for (const ch of content) yield { type: "llm_token", delta: ch };
  yield { type: "answer_done", full: content, tokens: finalR?.tokens ?? 0 };
}

// ============ Plan-Execute(保留简版 · 不展开中间数据) ============
async function* planExecute(opts: { query: string }): AsyncGenerator<SpanEvent> {
  yield { type: "react_iter_start", iter: 1 };
  const plan = await chat(
    [
      { role: "system", content: "Break the query into 3 numbered steps. Very brief." },
      { role: "user", content: opts.query },
    ],
    { max_tokens: 200 },
  );
  yield { type: "thought_done", full: plan?.content ?? "Step 1-3...", iter: 1 };

  for (let i = 1; i <= 3; i++) {
    yield { type: "tool_call_start", toolName: `step_${i}`, toolInput: { step: i }, iter: i };
    const r = await runTool("calc", { expr: `${i} + ${i}` });
    yield { type: "tool_call_end", toolName: `step_${i}`, toolOutput: r.result, toolMs: r.ms, iter: i };
  }

  const ans = await chat(
    [{ role: "user", content: `Synthesize for: ${opts.query}. One sentence.` }],
    { max_tokens: 200 },
  );
  const content = ans?.content ?? "mock 合成答案";
  for (const ch of content) yield { type: "llm_token", delta: ch };
  yield { type: "answer_done", full: content, tokens: ans?.tokens ?? 0 };
}

async function* reflexion(opts: { query: string }): AsyncGenerator<SpanEvent> {
  // 简版 · draft → critic → revise
  const draft = await chat([{ role: "user", content: `Draft an answer: ${opts.query}` }], { max_tokens: 200 });
  yield { type: "thought_done", full: `DRAFT: ${draft?.content ?? ""}`.slice(0, 400), iter: 1 };
  const critic = await chat(
    [{ role: "user", content: `Score this draft 0-10 · one line:\n${draft?.content ?? ""}` }],
    { max_tokens: 80 },
  );
  yield { type: "thought_done", full: `CRITIC: ${critic?.content ?? ""}`, iter: 2 };
  const final = await chat(
    [{ role: "user", content: `Revise based on critic:\n${draft?.content}\nCritic:${critic?.content}` }],
    { max_tokens: 400 },
  );
  const content = final?.content ?? "mock revised";
  for (const ch of content) yield { type: "llm_token", delta: ch };
  yield { type: "answer_done", full: content, tokens: final?.tokens ?? 0 };
}
