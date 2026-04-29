import Image from "next/image";
import { BreathingDot } from "@/components/motion/breathing-dot";
import { cn } from "@/lib/utils";
import type { ScriptStep } from "@/lib/agent/script-ecom-dm";
import {
  MessageCircle,
  User2,
  Package,
  Ruler,
  Layers,
  FileText,
  Sparkles,
  Check,
  Clock,
  Send,
  TrendingUp,
} from "lucide-react";

/**
 * 渲染当前 step 的 artifact · 按 type 分发到具体组件
 */
export function ArtifactRenderer({ step }: { step: ScriptStep }) {
  const { artifact } = step;
  switch (artifact.type) {
    case "inbound_dm":
      return <InboundDmCard data={artifact.data as unknown as InboundData} />;
    case "intent_tag":
      return <IntentTagCard data={artifact.data as unknown as IntentData} />;
    case "customer_profile":
      return <CustomerProfileCard data={artifact.data as unknown as ProfileData} />;
    case "product_card":
      return <ProductCard data={artifact.data as unknown as ProductData} />;
    case "size_recommend":
      return <SizeRecommendCard data={artifact.data as unknown as SizeData} />;
    case "competitors":
      return <CompetitorsCard data={artifact.data as unknown as CompData} />;
    case "draft_variants":
      return <DraftVariantsCard data={artifact.data as unknown as DraftData} />;
    case "outfit_hero":
      return <OutfitHeroCard data={artifact.data as unknown as OutfitData} />;
    case "approval":
      return <ApprovalCard data={artifact.data as unknown as ApprovalData} />;
    case "sent_message":
      return <SentMessageCard data={artifact.data as unknown as SentData} />;
    default:
      return <EmptyArtifact />;
  }
}

/* ─────────── Generic wrappers ─────────── */

function ArtifactFrame({
  icon: Icon,
  label,
  subtle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 pb-3 mb-4 border-b border-stroke">
        <Icon className="h-3.5 w-3.5 text-alive" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
          artifact
        </span>
        <span className="text-[10px] font-mono text-text-mid">/ {label}</span>
        {subtle && (
          <span className="ml-auto text-[10px] font-mono text-text-lo">
            {subtle}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}

function EmptyArtifact() {
  return (
    <div className="h-full flex items-center justify-center text-text-lo text-sm">
      等待本步产出…
    </div>
  );
}

/* ═════════════ 1. 入站私信 ═════════════ */

interface InboundData {
  from: string;
  avatar_hue: number;
  message: string;
  time: string;
  platform: string;
}

function InboundDmCard({ data }: { data: InboundData }) {
  return (
    <ArtifactFrame icon={MessageCircle} label="入站私信" subtle={data.platform}>
      <div className="space-y-3">
        <div className="rounded-2xl bg-[#1a1a24] border border-stroke p-4">
          <div className="flex items-center gap-3 mb-3">
            <span
              className="h-8 w-8 rounded-full shrink-0"
              style={{
                background: `linear-gradient(135deg, hsl(${data.avatar_hue} 60% 60%), hsl(${data.avatar_hue + 40} 60% 45%))`,
              }}
            />
            <div className="min-w-0">
              <div className="text-sm font-medium">{data.from}</div>
              <div className="text-[10px] font-mono text-text-lo">
                {data.platform} · {data.time}
              </div>
            </div>
            <span className="ml-auto text-[10px] font-mono text-pending">
              unread
            </span>
          </div>
          <div className="relative">
            <div className="rounded-2xl rounded-tl-sm bg-white/[0.04] border border-stroke px-4 py-3 text-sm text-text-hi leading-relaxed">
              {data.message}
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-alive/25 bg-alive/5 p-3 text-xs text-text-mid flex items-start gap-2">
          <BreathingDot size="xs" />
          <span>
            深夜时段（02:14） · 人工客服已下班 · FF-Autopilot 自动接管
          </span>
        </div>
      </div>
    </ArtifactFrame>
  );
}

/* ═════════════ 2. 意图分类 ═════════════ */

interface IntentData {
  intent: string;
  confidence: number;
  urgency: string;
  reasoning: string;
  llm?: { id: string | null; ms: number; model: string; ok: boolean };
}

function IntentTagCard({ data }: { data: IntentData }) {
  const pct = Math.round(data.confidence * 100);
  const subtle = data.llm?.id
    ? `Claude ${data.llm.ms}ms · ${data.llm.id.slice(0, 16)}…`
    : undefined;
  return (
    <ArtifactFrame icon={Sparkles} label="意图分类结果" subtle={subtle}>
      <div className="space-y-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo mb-2">
            top intent
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-alive/40 bg-alive/10 px-4 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-alive animate-pulse" />
            <span className="text-base font-medium text-alive">
              {data.intent}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-text-lo mb-1.5">
            <span>confidence</span>
            <span className="text-text-hi">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-alive via-violet to-magenta transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2 text-[10px] font-mono">
          <span className="rounded-full border border-stroke px-2 py-0.5 text-text-mid">
            urgency / {data.urgency}
          </span>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo mb-1.5">
            why
          </div>
          <p className="text-sm text-text-mid leading-relaxed">
            {data.reasoning}
          </p>
        </div>
      </div>
    </ArtifactFrame>
  );
}

/* ═════════════ 3. 客户画像 ═════════════ */

interface ProfileData {
  name: string;
  type: string;
  total_spend: number;
  last_size: string;
  preference: string;
  tags: string[];
}

function CustomerProfileCard({ data }: { data: ProfileData }) {
  return (
    <ArtifactFrame icon={User2} label="客户画像" subtle="mem0.recall">
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-stroke bg-panel/40 p-3">
            <dt className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
              累计消费
            </dt>
            <dd className="mt-1 text-lg font-semibold tracking-tight">
              ¥ {data.total_spend.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-lg border border-stroke bg-panel/40 p-3">
            <dt className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
              上次尺码
            </dt>
            <dd className="mt-1 text-lg font-semibold tracking-tight">
              {data.last_size}
            </dd>
          </div>
        </dl>
      </div>
    </ArtifactFrame>
  );
}

/* ═════════════ 4. 商品详情 ═════════════ */

interface ProductData {
  name: string;
  color: string;
  price: number;
  sizes: Record<string, number>;
  fit: string;
}

function ProductCard({ data }: { data: ProductData }) {
  return (
    <ArtifactFrame icon={Package} label="商品信息" subtle="shop.product_info">
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{data.name}</h3>
          <div className="mt-0.5 text-xs text-text-mid">
            {data.color} · fit / {data.fit}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">¥ {data.price}</span>
          <span className="text-xs text-text-lo">单件</span>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo mb-2">
            库存
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(data.sizes).map(([size, stock]) => (
              <div
                key={size}
                className={cn(
                  "rounded-lg border text-center py-2",
                  stock > 10
                    ? "border-success/30 bg-success/5"
                    : stock > 0
                    ? "border-pending/30 bg-pending/5"
                    : "border-error/30 bg-error/5"
                )}
              >
                <div className="text-sm font-semibold">{size}</div>
                <div className="text-[10px] font-mono text-text-mid">
                  {stock} 件
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ArtifactFrame>
  );
}

/* ═════════════ 5. 尺码推荐 ═════════════ */

interface SizeData {
  primary: string;
  alt: string;
  confidence: number;
  height: number;
  m_bust: number;
  l_bust: number;
  llm?: { id: string | null; ms: number; model: string; ok: boolean };
}

function SizeRecommendCard({ data }: { data: SizeData }) {
  const subtle = data.llm?.id
    ? `Claude ${data.llm.ms}ms · ${data.llm.id.slice(0, 16)}…`
    : "llm.reason_size";
  return (
    <ArtifactFrame icon={Ruler} label="尺码推荐" subtle={subtle}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-alive/40 bg-alive/10 px-5 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-alive">
              主推
            </div>
            <div className="text-3xl font-semibold text-alive">
              {data.primary}
            </div>
          </div>
          <div className="rounded-xl border border-stroke px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
              备选
            </div>
            <div className="text-2xl font-semibold text-text-mid">
              {data.alt}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
              confidence
            </div>
            <div className="text-lg font-semibold">
              {Math.round(data.confidence * 100)}%
            </div>
          </div>
        </div>

        <div className="text-xs text-text-mid leading-relaxed">
          客户身高 <span className="text-text-hi">{data.height}cm</span> ·
          oversize 剪裁 L 码胸围 <span className="text-text-hi">{data.l_bust}cm</span>
          · 已覆盖舒适落肩 · 若追求更松量推荐备选 XL
        </div>
      </div>
    </ArtifactFrame>
  );
}

/* ═════════════ 6. 竞品扫描 ═════════════ */

interface CompData {
  scanned: number;
  top_pairing: string;
  insight: string;
}

function CompetitorsCard({ data }: { data: CompData }) {
  return (
    <ArtifactFrame icon={Layers} label="竞品扫描" subtle={`并发 ${data.scanned}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-stroke bg-panel/40 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
              top 搭配
            </div>
            <div className="mt-1 text-sm font-medium">{data.top_pairing}</div>
          </div>
          <div className="rounded-lg border border-stroke bg-panel/40 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
              洞察
            </div>
            <div className="mt-1 text-xs text-success">{data.insight}</div>
          </div>
        </div>
      </div>
    </ArtifactFrame>
  );
}

/* ═════════════ 7. 草稿变体 ═════════════ */

interface DraftData {
  variants: { tag: string; score: number; body: string }[];
  winner: number;
  customer_text?: string;
  llm?: { id: string | null; ms: number; model: string; ok: boolean };
}

function DraftVariantsCard({ data }: { data: DraftData }) {
  const subtle = data.llm?.id
    ? `Claude ${data.llm.ms}ms · ${data.llm.id.slice(0, 16)}…`
    : `winner = #${data.winner + 1}`;
  return (
    <ArtifactFrame icon={FileText} label="起草 3 变体" subtle={subtle}>
      {data.customer_text && (
        <div className="mb-3 rounded-lg border border-alive/30 bg-alive/5 px-3 py-2 text-xs">
          <span className="text-alive font-mono text-[10px] mr-2">CUSTOMER ASK</span>
          <span className="text-white">{data.customer_text}</span>
        </div>
      )}
      <div className="space-y-3">
        {data.variants.map((v, i) => {
          const win = i === data.winner;
          return (
            <div
              key={i}
              className={cn(
                "rounded-xl border p-4 transition-all",
                win
                  ? "border-alive/50 bg-alive/5 shadow-[0_0_30px_-10px_rgba(0,212,255,0.4)]"
                  : "border-stroke bg-panel/40"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full",
                      win
                        ? "bg-alive/15 text-alive"
                        : "bg-white/[0.04] text-text-lo"
                    )}
                  >
                    #{i + 1} · {v.tag}
                  </span>
                  {win && (
                    <span className="text-[10px] text-alive font-mono">
                      ✓ selected
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-text-mid">
                  {Math.round(v.score * 100)}%
                </span>
              </div>
              <p className="text-sm text-text-mid leading-relaxed">{v.body}</p>
            </div>
          );
        })}
      </div>
    </ArtifactFrame>
  );
}

/* ═════════════ 8. 搭配主图 ═════════════ */

interface OutfitData {
  url: string;
  caption: string;
}

function OutfitHeroCard({ data }: { data: OutfitData }) {
  return (
    <ArtifactFrame icon={Sparkles} label="主视觉生成" subtle="image.generate">
      <div className="space-y-3">
        <div className="rounded-2xl border border-dashed border-stroke bg-panel/30 p-8 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-text-lo mb-3 opacity-50" />
          <div className="text-sm text-text-mid">
            图像生成 API 未接入 · MVP 暂不出图
          </div>
          <div className="mt-1 text-[10px] font-mono text-text-lo">
            caption hint · {data.caption}
          </div>
        </div>
      </div>
    </ArtifactFrame>
  );
}

/* ═════════════ 9. HITL 审批 ═════════════ */

interface ApprovalData {
  preview_body: string;
  image_url?: string;
  target: string;
}

function ApprovalCard({
  data,
  onApprove,
  onReject,
}: {
  data: ApprovalData;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <ArtifactFrame
      icon={Clock}
      label="等待人工审批"
      subtle="risk · medium"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-pending/40 bg-pending/5 p-4 flex items-start gap-3">
          <span className="text-lg">⚠️</span>
          <div className="text-xs leading-relaxed">
            <div className="font-semibold text-pending">带图回复需审批</div>
            <div className="text-text-mid mt-0.5">
              目标：{data.target} · 超时 24 小时自动发送
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-stroke bg-panel/40 overflow-hidden">
          <div className="px-4 py-2 border-b border-stroke bg-black/30 text-[11px] font-mono text-text-lo">
            回复预览
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm text-text-hi leading-relaxed">
              {data.preview_body}
            </p>
          </div>
        </div>

        {onApprove && (
          <div className="flex gap-2">
            <button
              onClick={onApprove}
              data-testid="btn-approve"
              className="flex-1 flex items-center justify-center gap-2 rounded-full h-11 px-5 font-medium text-void bg-[linear-gradient(90deg,#00D4FF_0%,#C084FC_50%,#F472B6_100%)] bg-[length:200%_100%] hover:bg-[position:100%_0] transition-all shadow-[0_8px_32px_-6px_rgba(0,212,255,0.45)]"
            >
              <Check className="h-4 w-4" />
              审核并发送
            </button>
            <button
              onClick={onReject}
              data-testid="btn-reject"
              className="flex items-center justify-center gap-2 rounded-full h-11 px-5 text-sm border border-stroke-strong text-text-hi hover:bg-white/[0.03] transition-colors"
            >
              拒绝
            </button>
          </div>
        )}
      </div>
    </ArtifactFrame>
  );
}

/* ═════════════ 10. 已发送 ═════════════ */

interface SentData {
  to: string;
  body: string;
  image_url?: string;
  delivered_at: string;
  turnaround_sec: number;
  weekly_report_row: number;
}

function SentMessageCard({ data }: { data: SentData }) {
  return (
    <ArtifactFrame icon={Send} label="已发送" subtle={`耗时 ${data.turnaround_sec}s`}>
      <div className="space-y-4">
        {/* 模拟 xhs 气泡 */}
        <div className="rounded-2xl bg-[#1a1a24] border border-stroke p-4 space-y-3">
          <div className="text-[10px] font-mono text-text-lo">
            到 {data.to} · {data.delivered_at}
          </div>
          <div className="rounded-2xl rounded-tr-sm bg-gradient-to-br from-alive/20 to-violet/15 border border-alive/20 px-4 py-3 text-sm leading-relaxed ml-auto max-w-[90%]">
            {data.body}
          </div>
          <div className="text-[10px] font-mono text-success flex items-center gap-1 justify-end">
            <Check className="h-3 w-3" /> delivered
          </div>
        </div>

        {/* 副产出 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-stroke bg-panel/40 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
              客户画像
            </div>
            <div className="mt-1 text-sm flex items-center gap-1.5">
              <Check className="h-3 w-3 text-success" />
              <span>已更新</span>
            </div>
          </div>
          <div className="rounded-lg border border-stroke bg-panel/40 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-lo">
              本周复盘
            </div>
            <div className="mt-1 text-sm flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-success" />
              <span>记入 #{data.weekly_report_row}</span>
            </div>
          </div>
        </div>
      </div>
    </ArtifactFrame>
  );
}

/** 导出 ApprovalCard 给外部（demo-runner 需注入 onApprove） */
export { ApprovalCard };
