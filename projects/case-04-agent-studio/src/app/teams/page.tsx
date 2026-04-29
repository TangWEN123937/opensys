"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { Plus, UserPlus, Check, X, Minus } from "lucide-react";

const members = [
  { name: "muyu", role: "Owner", email: "muyu@fufankeji.com", init: "M" },
  { name: "Alice", role: "Admin", email: "alice@fufankeji.com", init: "A" },
  { name: "Bob", role: "Developer", email: "bob@fufankeji.com", init: "B" },
  { name: "Carol", role: "Developer", email: "carol@fufankeji.com", init: "C" },
  { name: "Dan", role: "Viewer", email: "dan@partner.com", init: "D" },
];

const resources = ["Agents", "Skills", "MCP", "Tools", "Models", "Knowledge", "Eval", "Billing"];
const roles = ["Owner", "Admin", "Developer", "Viewer"];
const perms: Record<string, Record<string, "full" | "edit" | "read" | "none">> = {
  Owner: Object.fromEntries(resources.map((r) => [r, "full"])) as Record<string, "full">,
  Admin: Object.fromEntries(resources.map((r) => [r, r === "Billing" ? "read" : "full"])) as Record<string, "full" | "read">,
  Developer: Object.fromEntries(resources.map((r) => [r, ["Billing", "Eval"].includes(r) ? "read" : "edit"])) as Record<string, "edit" | "read">,
  Viewer: Object.fromEntries(resources.map((r) => [r, "read"])) as Record<string, "read">,
};

export default function TeamsPage() {
  return (
    <PageShell
      title="Teams & Permissions"
      subtitle="RBAC 矩阵 · 人 × 资源 × 动作三维控制 · 细粒度 ACL 到单个 Agent/Skill"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => notify.todo("新建自定义角色 · 矩阵勾选权限")}>
            <Plus className="w-3.5 h-3.5" /> 新角色
          </Button>
          <Button size="sm" onClick={() => notify.ok("邀请链接已复制", "有效期 72h · 也可邮件发送")}>
            <UserPlus className="w-3.5 h-3.5" /> 邀请成员
          </Button>
        </>
      }
    >
      {/* Members */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">成员 · {members.length}</h3>
          <Badge variant="mono" className="text-[10px]">Enterprise 席位:8 · 已用 5</Badge>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-elevated/30 text-[10px] uppercase tracking-wider text-ink-mute">
            <tr>
              <th className="text-left px-5 py-2 font-semibold">成员</th>
              <th className="text-left px-2 py-2 font-semibold">邮箱</th>
              <th className="text-left px-2 py-2 font-semibold">角色</th>
              <th className="text-right px-5 py-2 font-semibold">动作</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.name} className="border-t border-border-subtle hover:bg-elevated/30">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                      {m.init}
                    </div>
                    <span className="text-[13px] font-medium">{m.name}</span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-[12px] text-ink-soft font-mono">{m.email}</td>
                <td className="px-2 py-2.5">
                  <Badge variant={m.role === "Owner" ? "accent" : "outline"}>{m.role}</Badge>
                </td>
                <td className="px-5 py-2.5 text-right">
                  <button
                    className="text-[11px] text-primary hover:underline"
                    onClick={() => notify.todo(`编辑 ${m.name} · 改角色 / 改权限 / 禁用`)}
                  >
                    编辑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RBAC Matrix */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle">
          <h3 className="text-[13px] font-semibold">权限矩阵 · Role × Resource</h3>
          <p className="text-[11px] text-ink-mute mt-0.5">full 全权 · edit 可改 · read 只读 · none 无权</p>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-elevated/30">
            <tr>
              <th className="text-left px-5 py-2.5 font-semibold text-[11px] text-ink-soft min-w-[120px]">Role / Resource</th>
              {resources.map((r) => (
                <th key={r} className="text-center px-2 py-2.5 font-semibold text-[11px] text-ink-soft font-mono">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role} className="border-t border-border-subtle">
                <td className="px-5 py-3 font-medium">
                  <Badge variant={role === "Owner" ? "accent" : "outline"}>{role}</Badge>
                </td>
                {resources.map((res) => {
                  const p = perms[role][res];
                  return (
                    <td key={res} className="px-2 py-3 text-center">
                      <PermCell value={p} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

function PermCell({ value }: { value: "full" | "edit" | "read" | "none" }) {
  const map = {
    full: { icon: <Check className="w-3.5 h-3.5" strokeWidth={2.4} />, bg: "bg-success-tint", color: "text-success", label: "full" },
    edit: { icon: <Check className="w-3.5 h-3.5" strokeWidth={2.4} />, bg: "bg-info-tint", color: "text-info", label: "edit" },
    read: { icon: <Minus className="w-3.5 h-3.5" strokeWidth={2.4} />, bg: "bg-warning-tint", color: "text-warning", label: "read" },
    none: { icon: <X className="w-3.5 h-3.5" strokeWidth={2.4} />, bg: "bg-elevated", color: "text-ink-mute", label: "none" },
  }[value];
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <div className={`w-6 h-6 rounded-md ${map.bg} ${map.color} flex items-center justify-center`}>{map.icon}</div>
      <span className={`text-[9px] font-mono ${map.color}`}>{map.label}</span>
    </div>
  );
}
