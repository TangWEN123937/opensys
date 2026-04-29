import { AppShell } from "@/components/dashboard/app-shell";
import { Settings as SettingsIcon, Key, UserCircle2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  return (
    <AppShell active="settings">
      <header className="border-b border-stroke px-8 py-5">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-5 w-5 text-alive" />
          <h1 className="text-xl font-semibold tracking-tight">设置</h1>
        </div>
      </header>

      <div className="p-8 max-w-3xl space-y-5">
        <Card
          icon={UserCircle2}
          title="品牌语气"
          desc="简短描述你的语气，让 Agent 起草的内容保持一致。"
        >
          <textarea
            rows={4}
            defaultValue="随和而权威。不堆术语。先讲一个人的故事，最后落到一个具体可执行的要点。"
            className="w-full rounded-lg border border-stroke bg-panel/40 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-alive/50"
          />
        </Card>

        <Card
          icon={Key}
          title="API 密钥"
          desc="只需 ANTHROPIC_API_KEY · 未设置时走 Mock 模式也能跑。"
        >
          <Field
            label="ANTHROPIC_API_KEY"
            placeholder="sk-ant-…"
            status="present"
          />
          <Field
            label="MEM0_API_KEY（可选）"
            placeholder="mem0_…"
            status="missing"
          />
        </Card>

        <Card
          icon={Shield}
          title="自主边界"
          desc="哪些动作需要你审批后，Agent 才能执行。"
        >
          <Toggle label="向任何外部平台发布内容" on />
          <Toggle label="向新联系人发送 DM" on />
          <Toggle label="在同一会话内继续回复" on={false} />
          <Toggle label="生成新的图片" on={false} />
        </Card>
      </div>
    </AppShell>
  );
}

function Card({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stroke bg-panel/40 p-6">
      <div className="flex items-start gap-4">
        <Icon className="h-5 w-5 text-alive mt-0.5 shrink-0" />
        <div className="flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-text-mid">{desc}</p>
          <div className="mt-4 space-y-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  placeholder,
  status,
}: {
  label: string;
  placeholder?: string;
  status: "present" | "missing";
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-text-lo">{label}</span>
        <span
          className={cn(
            "text-[10px] font-mono",
            status === "present" ? "text-success" : "text-text-lo"
          )}
        >
          {status === "present" ? "✓ 已配置" : "○ 未设置"}
        </span>
      </div>
      <input
        type="password"
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-stroke bg-panel/40 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-alive/50"
      />
    </label>
  );
}

function Toggle({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-mid">{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          on ? "bg-alive" : "bg-white/10"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            on ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </span>
    </div>
  );
}
