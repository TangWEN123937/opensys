"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { MOCK_APPROVALS } from "@/lib/mock-data";
import { Check, X, Pencil, Inbox, Clock, Command, Send, CheckCircle2, XCircle } from "lucide-react";
import { XiaohongshuIcon } from "@/components/brand/platform-icons";
import { cn } from "@/lib/utils";

type Decision = "pending" | "approved" | "rejected";

export default function ApprovalsPage() {
  const approvals = MOCK_APPROVALS;
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(approvals.map((a) => [a.id, "pending" as Decision]))
  );
  const [currentId, setCurrentId] = useState(approvals[0]?.id ?? "");
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");

  const current = approvals.find((a) => a.id === currentId) ?? approvals[0];
  const currentDecision = decisions[current.id];

  const pendingCount = useMemo(
    () => Object.values(decisions).filter((d) => d === "pending").length,
    [decisions]
  );

  function handleApprove() {
    setDecisions((d) => ({ ...d, [current.id]: "approved" }));
    setEditing(false);
  }
  function handleReject() {
    setDecisions((d) => ({ ...d, [current.id]: "rejected" }));
    setEditing(false);
  }
  function handleEdit() {
    setDraftText(current.draft.body);
    setEditing(true);
  }
  function handleSelect(id: string) {
    setCurrentId(id);
    setEditing(false);
  }

  return (
    <AppShell active="approvals">
      <header className="border-b border-stroke px-8 py-5">
        <div className="flex items-center gap-3">
          <Inbox className="h-5 w-5 text-alive" />
          <h1 className="text-xl font-semibold tracking-tight">审批收件箱</h1>
          <span
            className={cn(
              "ml-1 text-xs font-mono rounded-full px-2 py-0.5 transition-colors",
              pendingCount > 0
                ? "bg-pending/15 text-pending"
                : "bg-success/15 text-success"
            )}
          >
            {pendingCount > 0 ? `${pendingCount} 条待审` : "全部已处理 ✓"}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-text-mid">
          高风险动作已暂停等待你审核 · 按{" "}
          <kbd className="font-mono text-[11px] bg-white/5 border border-stroke px-1.5 py-0.5 rounded">j</kbd>{" "}
          /{" "}
          <kbd className="font-mono text-[11px] bg-white/5 border border-stroke px-1.5 py-0.5 rounded">k</kbd>{" "}
          切换 ·{" "}
          <kbd className="font-mono text-[11px] bg-white/5 border border-stroke px-1.5 py-0.5 rounded">a</kbd>{" "}
          批量通过
        </p>
      </header>

      <div className="grid grid-cols-12 h-[calc(100vh-120px)]">
        <aside className="col-span-4 xl:col-span-3 border-r border-stroke overflow-y-auto">
          <ol className="p-2 space-y-1">
            {approvals.map((a) => (
              <ApprovalRow
                key={a.id}
                approval={a}
                active={a.id === currentId}
                decision={decisions[a.id]}
                onClick={() => handleSelect(a.id)}
              />
            ))}
          </ol>
        </aside>

        <section className="col-span-8 xl:col-span-9 overflow-y-auto p-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-mono text-text-lo">
              <span>所属目标 · {current.goalTitle}</span>
              <span>·</span>
              <Clock className="h-3 w-3" />
              <span>入队 {current.createdAt}</span>
            </div>

            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              发布到小红书
            </h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-text-mid">
              <XiaohongshuIcon className="h-4 w-4 text-[#FF2442]" />
              <span>@muyu</span>
              <span className="text-text-lo">·</span>
              <span>计划发布：{current.scheduledAt}</span>
            </div>

            <article
              className={cn(
                "mt-6 rounded-2xl border bg-panel/50 overflow-hidden transition-colors",
                currentDecision === "approved" && "border-success/40",
                currentDecision === "rejected" && "border-error/40",
                currentDecision === "pending" && "border-stroke"
              )}
            >
              <div className="px-5 py-3 border-b border-stroke bg-black/20 flex items-center gap-2 text-xs font-mono text-text-lo">
                <span className="h-2 w-2 rounded-full bg-[#FF2442]" />
                xiaohongshu 草稿 · {editing ? "编辑中" : "预览"}
                {currentDecision === "approved" && (
                  <span className="ml-auto inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3 w-3" />
                    已发布
                  </span>
                )}
                {currentDecision === "rejected" && (
                  <span className="ml-auto inline-flex items-center gap-1 text-error">
                    <XCircle className="h-3 w-3" />
                    已驳回
                  </span>
                )}
              </div>
              <div className="p-6">
                {editing ? (
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={12}
                    className="w-full bg-transparent font-sans text-[15px] leading-relaxed text-text-hi outline-none resize-none"
                    data-testid="draft-editor"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-text-hi">
                    {current.draft.body}
                  </pre>
                )}
              </div>
              <div className="px-6 py-3 border-t border-stroke flex items-center gap-4 text-xs text-text-lo">
                <span>📊 预估触达 2.4k</span>
                <span>·</span>
                <span>🎯 选题得分 0.87</span>
                <span>·</span>
                <span>✨ 品牌语气匹配 94%</span>
              </div>
            </article>

            {currentDecision === "approved" ? (
              <div
                className="mt-6 flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-5 py-4 text-sm"
                data-testid="approval-success"
              >
                <Send className="h-4 w-4 text-success" />
                <span className="text-success font-medium">
                  已通过审核 · Agent 已自动发布到小红书
                </span>
                <span className="ml-auto text-[11px] font-mono text-text-lo">
                  scheduled_at = {current.scheduledAt}
                </span>
              </div>
            ) : currentDecision === "rejected" ? (
              <div
                className="mt-6 flex items-center gap-3 rounded-xl border border-error/40 bg-error/10 px-5 py-4 text-sm"
                data-testid="approval-rejected"
              >
                <XCircle className="h-4 w-4 text-error" />
                <span className="text-error font-medium">
                  已驳回 · Agent 将在下个 cycle 重新起草
                </span>
              </div>
            ) : (
              <div className="mt-6 flex items-center gap-2">
                <Button
                  variant="accent"
                  size="lg"
                  onClick={handleApprove}
                  data-testid="btn-approve"
                >
                  <Check className="h-4 w-4" />
                  审核并发布
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={handleEdit}
                  data-testid="btn-edit"
                >
                  <Pencil className="h-4 w-4" />
                  {editing ? "保存修改" : "先修改"}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="ml-auto"
                  onClick={handleReject}
                  data-testid="btn-reject"
                >
                  <X className="h-4 w-4" />
                  拒绝
                </Button>
              </div>
            )}

            <details className="mt-8 rounded-xl border border-stroke bg-panel/30 p-4 text-sm">
              <summary className="cursor-pointer text-text-mid font-medium flex items-center gap-2">
                <Command className="h-3.5 w-3.5" />
                Agent 为什么这样起草？
              </summary>
              <div className="mt-3 space-y-2 text-text-mid leading-relaxed">
                <p>
                  Agent 扫描了过去 7 天 #AI工具 标签下 50 条爆款笔记。共同模式：数字榜单 + emoji + 具体使用场景 + 互动钩子结尾。
                </p>
                <p>
                  Claude 4.7 起草了 3 条变体。这一条品牌语气匹配度最高（94%），预估触达基于近 14 天同赛道头部账号的中位数。
                </p>
                <p className="text-text-lo font-mono text-[11px]">
                  reasoning.mem0.brand_voice=casual_xhs_blogger · 156 tokens
                </p>
              </div>
            </details>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ApprovalRow({
  approval,
  active,
  decision,
  onClick,
}: {
  approval: (typeof MOCK_APPROVALS)[number];
  active: boolean;
  decision: Decision;
  onClick: () => void;
}) {
  const handled = decision !== "pending";
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "group w-full text-left px-3 py-3 rounded-lg transition-colors",
          active && !handled ? "bg-white/[0.05]" : "hover:bg-white/[0.02]",
          handled && "opacity-55"
        )}
      >
        <div className="flex items-center gap-2">
          <XiaohongshuIcon className="h-3.5 w-3.5 text-[#FF2442] shrink-0" />
          <span className="text-xs font-mono text-text-lo flex-1 truncate">
            {approval.goalTitle}
          </span>
          {decision === "approved" && (
            <span className="text-[10px] font-mono text-success shrink-0 inline-flex items-center gap-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" />
              已发布
            </span>
          )}
          {decision === "rejected" && (
            <span className="text-[10px] font-mono text-error shrink-0 inline-flex items-center gap-0.5">
              <XCircle className="h-2.5 w-2.5" />
              已驳回
            </span>
          )}
          {decision === "pending" && (
            <span className="text-[10px] font-mono text-pending shrink-0">
              {approval.createdAt}
            </span>
          )}
        </div>
        <p
          className={cn(
            "mt-1.5 text-sm leading-snug line-clamp-2",
            active && !handled ? "text-white" : "text-text-mid",
            handled && "line-through decoration-text-lo/40"
          )}
        >
          {approval.preview}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-text-lo">
          <Clock className="h-2.5 w-2.5" />
          <span>计划 · {approval.scheduledAt}</span>
        </div>
      </button>
    </li>
  );
}
