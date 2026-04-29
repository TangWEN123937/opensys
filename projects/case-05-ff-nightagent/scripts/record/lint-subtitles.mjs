/**
 * 字幕风格 linter · 跑剧本前自动扫描所有 subtitle 文本
 *
 * 规则源自 SUBTITLE-STYLE.md (强制 5 禁令 + 长度区间)。
 * 违规返回 {ok:false, issues:[...]} · runner 拒跑。
 */

const FORBIDDEN = [
  // 比喻 / 隐喻
  { pat: /方向盘|行车记录|自驾代理|夜班|开启夜班|松开方向|代驾|副驾/, kind: "比喻", reason: "用功能描述替代品牌比喻" },
  // 第二人称
  { pat: /你的|你只|你睡|你审批|你管|帮你|替你|为你|让你/, kind: "第二人称", reason: "字幕是中立播报 · 不对观众喊话" },
  // 诗意 / 拟人
  { pat: /一夜不停|永不停摆|永不掉线|不知疲倦|灵魂|起飞|绽放|绝美|惊艳|炸裂|颠覆|王炸/, kind: "诗意/拟人", reason: "文学化表达稀释信息密度" },
  // 引导 / 过渡
  { pat: /^→|^接下来|^现在(进入|开始|去|来)|演示完整|让我们|带大家|这一段/, kind: "过渡引导", reason: "字幕跳剪自然衔接 · 不要串场" },
  // 教学 / 元说明
  { pat: /教学演示|压缩成.*演完|为方便|为讲解|课程|课件|本节|本章/, kind: "教学注释", reason: "介绍产品不是介绍课件" },
];

const MIN_LEN = 4;   // 含汉字数下限 · 品牌标题（FF-Autopilot · X）允许较少汉字
const MAX_LEN = 26;  // 字符总长上限 · 36px 字号在 1440 宽下不换行的安全值

function countChinese(s) {
  return (s.match(/[一-鿿]/g) || []).length;
}

export function lintSubtitle(text) {
  const issues = [];
  if (!text || typeof text !== "string") return issues;

  // 长度
  const total = [...text].length;
  const cn = countChinese(text);
  if (total > MAX_LEN) {
    issues.push({ rule: "长度", msg: `${total} 字符，超过 ${MAX_LEN} 字符上限` });
  }
  if (cn > 0 && cn < MIN_LEN) {
    issues.push({ rule: "长度", msg: `仅 ${cn} 个汉字，可能信息量不足` });
  }

  // 禁令
  for (const f of FORBIDDEN) {
    const m = text.match(f.pat);
    if (m) {
      issues.push({ rule: `禁词·${f.kind}`, msg: `命中「${m[0]}」 — ${f.reason}` });
    }
  }

  return issues;
}

export function lintScript(script) {
  const all = [];
  const steps = script.steps || [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const idx = i + 1;
    const subs = [step.subtitle, step.action === "subtitle" ? step.text : null].filter(Boolean);
    for (const text of subs) {
      const issues = lintSubtitle(text);
      if (issues.length) {
        all.push({ idx, at: step.at, text, issues });
      }
    }

    // 反模式 · scrollBy/scrollTo 紧跟独立 subtitle
    // 字幕必须用 scene 锚定 · 否则会"飘在画面间"
    if (step.action === "subtitle") {
      const prev = steps[i - 1];
      if (prev && (prev.action === "scrollBy" || prev.action === "scrollTo")) {
        all.push({
          idx,
          at: step.at,
          text: step.text,
          issues: [
            {
              rule: "锚点·字幕飘",
              msg: `紧跟 ${prev.action} 之后的独立 subtitle · 字幕落点不可控 · 改用 scene action 把 anchor + subtitle 绑死（详见 SUBTITLE-STYLE.md §7）`,
            },
          ],
        });
      }
    }
  }
  return all;
}

/* CLI: node lint-subtitles.mjs <script.json> */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const path = process.argv[2];
  if (!path) {
    console.error("用法: node lint-subtitles.mjs <script.json>");
    process.exit(1);
  }
  const script = JSON.parse(readFileSync(path, "utf8"));
  const violations = lintScript(script);
  if (violations.length === 0) {
    console.log(`✅ ${path} · 全部 ${script.steps.length} 步字幕通过风格 lint`);
    process.exit(0);
  }
  console.error(`❌ ${path} · 发现 ${violations.length} 条违规字幕：\n`);
  for (const v of violations) {
    console.error(`  [${v.at || "#" + v.idx}] "${v.text}"`);
    for (const i of v.issues) {
      console.error(`     · ${i.rule}: ${i.msg}`);
    }
    console.error("");
  }
  console.error("→ 请按 scripts/record/SUBTITLE-STYLE.md 重写后再跑\n");
  process.exit(2);
}
