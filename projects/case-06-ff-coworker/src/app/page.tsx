import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LiveCounter } from "@/components/live-counter";
import { IsometricOffice } from "@/components/isometric-office";
import { MechanismStrip } from "@/components/mechanism-strip";
import { scenarios } from "@/lib/scenarios";

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      {/* ═══ Hero · 首屏 ═══════════════════════════ */}
      <section id="hero" className="relative overflow-hidden">
        <div className="container-pro pt-16 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-10 items-start">

            {/* 左 · 标题 */}
            <div className="fade-up">
              <div className="badge-tag badge-tag-warmth mb-6">
                <span className="w-1 h-1 rounded-full bg-warmth-deep" />
                CASE 06 · 一人公司 · AI 员工系统
              </div>

              <h1 className="font-display text-[48px] md:text-[62px] lg:text-[68px] leading-[1.1] text-ink tracking-tight">
                <span className="block whitespace-nowrap">这是<span className="text-warmth-deep">老板小王</span>。</span>
                <span className="block whitespace-nowrap">他的公司有<span className="hand-underline">6 个员工</span>。</span>
                <span className="block whitespace-nowrap">其中<span className="text-warmth-deep">5 个</span>是 AI。</span>
              </h1>

              <p className="mt-8 text-lg text-ink-soft max-w-[540px] leading-relaxed font-sans">
                昨晚他睡觉的时候，公司营收增加了
                <span className="text-ink font-semibold font-display"> ¥8,650</span>。
                这里是他的办公室 —— 6 个 AI 员工 7×24 在岗 · 飞书远程指挥 ·
                基于 Anthropic 官方 Context Engineering 8 大机制。
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link href="/office" className="btn-primary">
                  进入办公室看他们在干活 →
                </Link>
                <Link href="/scenarios" className="btn-ghost">
                  5 个真实落地场景
                </Link>
              </div>

              {/* 信任凭证条 */}
              <div className="mt-12 pt-6 border-t border-ink-hair grid grid-cols-3 gap-6 max-w-[540px]">
                <TrustCell top="¥3 亿+" bot="Heygen / Medvi 一人公司年营收" />
                <TrustCell top="¥10 万/月" bot="00 后独立开发者 AI 工具" />
                <TrustCell top="10-50×" bot="资本效率 vs 传统创业团队" />
              </div>
            </div>

            {/* 右 · Live Counter */}
            <div className="fade-up" style={{ animationDelay: "0.2s" }}>
              <LiveCounter />

              {/* 小副卡片 · 今日已做的事 */}
              <div className="paper mt-5 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mid">
                    今日已完成
                  </span>
                  <span className="font-mono text-[11px] text-warmth-deep">LIVE</span>
                </div>
                <ul className="space-y-2 text-[13px]">
                  <TaskLine emp="陈昊" done="合并 12 个 Gitee PR · 部署 v1.2.3 到阿里云" />
                  <TaskLine emp="江雨" done="发出 188 条企微 + 60 封北美邮件 · 收 41 条回复" />
                  <TaskLine emp="林夏" done="批量生成 500 张小红书种草图 · OSS 已分发" />
                  <TaskLine emp="沈墨" done="日报已发飞书 · 等老板审批" pending />
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Office · 等距办公室俯视图 ════════════════ */}
      <section id="office-preview" className="relative py-16">
        <div className="container-pro">
          <div className="text-center mb-10">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-warmth-deep mb-3">
              The Office · 你的 AI 员工办公室
            </div>
            <h2 className="font-display text-4xl md:text-5xl text-ink leading-tight">
              点一个员工 · 看 Ta <span className="hand-underline">正在想什么</span>
            </h2>
            <p className="mt-4 text-ink-mid max-w-2xl mx-auto">
              每个工位都是一个独立 context 的子 agent。
              纸飞机代表 ACP 协议消息在员工间传递。
              中央空椅子是你的位置 —— 老板在任何地方。
            </p>
          </div>

          <IsometricOffice />

          {/* 图例 */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[12px] font-mono text-ink-mid">
            <Legend dot="bg-sage"    label="自主运行" />
            <Legend dot="bg-warmth"  label="思考中" />
            <Legend dot="bg-gold"    label="等待审批" />
            <Legend dot="bg-ink-lo"  label="休眠" />
          </div>
        </div>
      </section>

      {/* ═══ 8 机制透视条 ══════════════════════════ */}
      <MechanismStrip />

      {/* ═══ 5 场景 · 预览 ═══════════════════════════ */}
      <section id="scenarios-preview" className="relative py-20 bg-paper/40">
        <div className="container-pro">
          <div className="text-center mb-12">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-warmth-deep mb-3">
              Real-World Deployments · 真实落地
            </div>
            <h2 className="font-display text-4xl md:text-5xl text-ink">
              5 个可以照抄的<span className="hand-underline">一人公司</span>模板
            </h2>
            <p className="mt-4 text-ink-mid max-w-2xl mx-auto">
              每个场景都是 2025-2026 真实案例 · 带可追溯的来源。
              你可以把这套员工配置复制到你的飞书里，立刻开跑。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {scenarios.map((s) => (
              <Link
                key={s.id}
                href={`/scenarios#${s.id}`}
                className="paper p-5 hover:-translate-y-0.5 transition-transform group flex flex-col"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[10px] text-ink-lo tracking-wider">
                    {s.badge}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-warmth" />
                </div>
                <div className="font-display text-xl text-ink mb-2 leading-tight">
                  {s.title}
                </div>
                <p className="text-[12px] text-ink-mid leading-relaxed flex-1">
                  {s.subhead}
                </p>
                <div className="mt-4 pt-3 border-t border-ink-hair">
                  <div className="text-[10px] text-ink-lo mb-1 font-mono uppercase tracking-wider">
                    核心数字
                  </div>
                  <div className="font-display text-lg text-warmth-deep">
                    {s.roi[0].value}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/scenarios" className="btn-ghost">
              看 5 个完整场景 Demo →
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 行动号召 · 飞书 ════════════════════════ */}
      <section className="relative py-24">
        <div className="container-pro">
          <div className="paper p-10 md:p-16 relative overflow-hidden">
            <div
              className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-60"
              style={{
                background:
                  "radial-gradient(circle, rgba(217,119,87,0.18), transparent 70%)",
              }}
            />
            <div className="relative grid md:grid-cols-[1.3fr_0.7fr] gap-10 items-center">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-warmth-deep mb-3">
                  30 秒自己跑一遍
                </div>
                <h2 className="font-display text-4xl md:text-5xl text-ink leading-tight">
                  扫飞书 · 雇你的第一个 <span className="hand-underline">AI 员工</span>
                </h2>
                <p className="mt-5 text-ink-mid leading-relaxed max-w-lg">
                  Hermes Agent + 飞书 Gateway 已验证可用。
                  添加机器人 · 发 <code className="px-1.5 py-0.5 rounded bg-paper-2 font-mono text-[12px] text-warmth-deep">/hire CTO</code>
                  · 你的第一个 AI 员工就上岗了。
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/feishu" className="btn-primary">
                    看飞书绑定流程 →
                  </Link>
                  <Link href="/settings" className="btn-ghost">
                    配置 OpenRouter / Claude
                  </Link>
                </div>
              </div>

              {/* QR 样式卡 */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-44 h-44 rounded-xl border-2 border-ink bg-canvas flex items-center justify-center relative">
                  {/* QR 占位 · 后续替换真实 QR */}
                  <FakeQR />
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 badge-tag">
                    飞书机器人
                  </span>
                </div>
                <span className="mt-3 font-mono text-[10px] text-ink-lo uppercase tracking-wider">
                  Scan to Hire
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

/* ════════════════════════════════════════════════════════ */

function TrustCell({ top, bot }: { top: string; bot: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-[22px] text-ink leading-none">{top}</span>
      <span className="text-[11px] text-ink-lo mt-1.5 leading-snug">{bot}</span>
    </div>
  );
}

function TaskLine({ emp, done, pending }: { emp: string; done: string; pending?: boolean }) {
  return (
    <li className="flex items-baseline gap-2.5">
      <span
        className={`inline-flex w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-1px] ${
          pending ? "bg-pending" : "bg-sage"
        }`}
      />
      <span className="font-medium text-ink text-[12px] shrink-0">{emp}</span>
      <span className="text-ink-mid text-[12px] leading-snug">{done}</span>
    </li>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}

/** 纯 SVG 假二维码 · 商业级占位 */
function FakeQR() {
  // 生成一个稳定伪随机矩阵
  const size = 21;
  const cells: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) {
      // 三个定位角
      const inCorner =
        (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
      if (inCorner) {
        const lx = x % 7, ly = y % 7;
        const corner =
          (x >= size - 7 ? x - (size - 7) : x) % 7;
        const cornerY = (y >= size - 7 ? y - (size - 7) : y) % 7;
        const isFrame =
          corner === 0 || corner === 6 || cornerY === 0 || cornerY === 6;
        const isCore =
          corner >= 2 && corner <= 4 && cornerY >= 2 && cornerY <= 4;
        row.push(isFrame || isCore);
      } else {
        // 稳定伪随机
        row.push(((x * 7 + y * 11 + x * y) % 3) === 0);
      }
    }
    cells.push(row);
  }
  return (
    <svg width="150" height="150" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#FBF7F1" />
      {cells.map((row, y) =>
        row.map((on, x) =>
          on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0F0F12" /> : null
        )
      )}
    </svg>
  );
}
