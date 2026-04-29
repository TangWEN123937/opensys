import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function SettingsPage() {
  return (
    <>
      <SiteHeader />

      <section className="py-14">
        <div className="container-pro grid md:grid-cols-[260px_1fr] gap-10">
          <aside>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-mid mb-4">
              系统配置
            </div>
            <nav className="flex flex-col gap-2 text-sm">
              <a href="#model"    className="paper px-4 py-3 hover:translate-x-0.5 transition">模型 · OpenRouter</a>
              <a href="#gateway"  className="paper px-4 py-3 hover:translate-x-0.5 transition">飞书 · 企业微信</a>
              <a href="#skills"   className="paper px-4 py-3 hover:translate-x-0.5 transition">Skills 市场</a>
              <a href="#autonomy" className="paper px-4 py-3 hover:translate-x-0.5 transition">自治度与审批</a>
            </nav>
          </aside>

          <div className="space-y-10">
            <Card id="model" title="模型 · 切换 200+ 可选">
              <Row label="OPENROUTER_API_KEY" placeholder="sk-or-v1-···" />
              <Row label="ANTHROPIC_API_KEY" placeholder="sk-ant-···" />
              <Row label="默认模型" placeholder="anthropic/claude-sonnet-4-6" />
              <p className="text-[12px] text-ink-mid mt-4">
                Hermes 原生支持 OpenRouter / NVIDIA NIM / OpenAI / 自定义端点。
                一键 <code className="font-mono text-warmth-deep">hermes model</code> 切换。
              </p>
            </Card>

            <Card id="gateway" title="飞书 Gateway 凭证">
              <Row label="FEISHU_APP_ID" placeholder="cli_···" />
              <Row label="FEISHU_APP_SECRET" placeholder="xxx" />
              <Row label="FEISHU_VERIFY_TOKEN" placeholder="xxx" />
              <p className="text-[12px] text-ink-mid mt-4">
                对应 Hermes <code className="font-mono">gateway/platforms/feishu.py</code> 的环境变量。
                国内生态 · 开箱即用。
              </p>
            </Card>

            <Card id="skills" title="Skills 市场">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {["devops", "data-science", "email", "github", "creative", "media", "productivity", "note-taking", "autonomous-ai-agents"].map((s) => (
                  <label key={s} className="flex items-center gap-2 paper px-3 py-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-warmth" />
                    <span className="font-mono text-[12px] text-ink">{s}</span>
                  </label>
                ))}
              </div>
              <p className="text-[12px] text-ink-mid mt-4">
                每个 skill 对应 Hermes <code className="font-mono">skills/</code> 的一个目录。
                勾选哪几个 · 你的 AI 员工就获得哪些岗位能力。
              </p>
            </Card>

            <Card id="autonomy" title="自治度与审批">
              <AutonomyLevel level="read-only"  label="只读 · 只能看 · 不能动" />
              <AutonomyLevel level="auto-safe"  label="安全自主 · 非破坏性任务自动做 · 默认推荐" active />
              <AutonomyLevel level="auto-bold"  label="全自动 · 包括合并 PR / 扣款 / 发件" />
            </Card>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="paper p-6 scroll-mt-20">
      <div className="font-display text-xl text-ink mb-5">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-3">
      <span className="font-mono text-[11px] uppercase tracking-wider text-ink-lo">{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        className="font-mono text-sm bg-canvas border border-ink-line rounded-lg px-3 py-2 w-full outline-none focus:border-warmth placeholder:text-ink-lo"
      />
    </div>
  );
}

function AutonomyLevel({ level, label, active }: { level: string; label: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 border rounded-lg px-4 py-3 ${active ? "border-warmth bg-warmth-soft" : "border-ink-line"}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${active ? "bg-warmth" : "bg-ink-lo"}`} />
      <span className="font-mono text-[12px] text-ink uppercase tracking-wider w-24">{level}</span>
      <span className="text-[13px] text-ink-mid flex-1">{label}</span>
      {active && <span className="badge-tag badge-tag-warmth !text-[10px]">当前</span>}
    </div>
  );
}
