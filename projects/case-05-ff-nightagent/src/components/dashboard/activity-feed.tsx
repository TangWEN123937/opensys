import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ActivityKind = "info" | "success" | "warn" | "dm" | "file";

interface ActivityItem {
  id: string;
  time: string;
  text: string;
  kind?: ActivityKind;
}

const ICONS: Record<ActivityKind, LucideIcon> = {
  info: Sparkles,
  success: CheckCircle2,
  warn: AlertCircle,
  dm: MessageSquare,
  file: FileText,
};

const TONE: Record<ActivityKind, string> = {
  info: "text-text-mid",
  success: "text-success",
  warn: "text-pending",
  dm: "text-violet",
  file: "text-text-mid",
};

const DEMO_ACTIVITIES: ActivityItem[] = [
  { id: "a1", time: "刚刚", text: "生成 hero-variant-2.png", kind: "file" },
  { id: "a2", time: "2 分钟前", text: "分析了 @competitor/alice 的 5 条帖子", kind: "info" },
  { id: "a3", time: "8 分钟前", text: "排队 1 条 DM 等待审批", kind: "warn" },
  { id: "a4", time: "14 分钟前", text: "回复了 @johndoe · 自动生成 3 条变体", kind: "dm" },
  { id: "a5", time: "22 分钟前", text: "完成步骤 『起草 10 条内容变体』", kind: "success" },
  { id: "a6", time: "45 分钟前", text: "Mem0 记忆召回 · 加载品牌语气（217 tokens）", kind: "info" },
];

export function ActivityFeed({
  items = DEMO_ACTIVITIES,
}: {
  items?: ActivityItem[];
}) {
  return (
    <section className="rounded-xl border border-stroke bg-panel/40 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs uppercase tracking-wider text-text-lo">
          最近活动
        </div>
        <div className="text-[10px] font-mono text-text-lo">近 1 小时</div>
      </div>
      <ul className="space-y-2">
        {items.map((it, idx) => {
          const Icon = ICONS[it.kind ?? "info"];
          return (
            <li
              key={it.id}
              className="group flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-md hover:bg-white/[0.02] transition-colors"
              style={{ animation: `fade-up 300ms ease-out ${idx * 40}ms backwards` }}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", TONE[it.kind ?? "info"])} />
              <span className="w-20 shrink-0 text-[11px] font-mono text-text-lo">
                {it.time}
              </span>
              <span className="text-sm text-text-mid flex-1 truncate">
                {it.text}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
