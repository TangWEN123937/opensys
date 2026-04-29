/**
 * /agent 页面的用户输入 schema · 前后端共用
 */

export interface IncomingMessage {
  customer: string;          // 客户名 / 昵称
  text: string;              // 私信原文
  time?: string;             // 发送时间 HH:MM
  height?: number;           // 身高（可选，尺码推荐用）
}

export interface ProductSpec {
  name: string;
  color?: string;
  price: number;
  fit?: "regular" | "oversize" | "slim";
  sizes: Record<string, number>;   // { M: 18, L: 12, XL: 5 }
}

export type BrandVoice =
  | "friendly_sister"     // 亲切姐妹
  | "pro_consultant"      // 专业顾问
  | "casual_cool";        // 松弛高级

export type ApprovalPolicy =
  | "all"                 // 所有发布都审
  | "risky_only"          // 仅带图/高风险审
  | "none";               // 全自动

export interface UserInput {
  platform?: "xiaohongshu" | "wechat" | "taobao" | "weibo";
  messages: IncomingMessage[];
  product: ProductSpec;
  brand_voice: BrandVoice;
  approval_policy: ApprovalPolicy;
  customer_profile?: {
    type?: "new" | "老客户" | "VIP";
    last_size?: string;
    total_spend?: number;
    tags?: string[];
  };
}

/** 默认示例 · 一键填充用 */
export const EXAMPLE_INPUT: UserInput = {
  platform: "xiaohongshu",
  messages: [
    {
      customer: "张小姐",
      text: "姐妹这件T恤还有L码吗？我175的穿L还是XL？在线等急！",
      time: "02:14:33",
      height: 175,
    },
  ],
  product: {
    name: "Essential Oversize 圆领 T 恤",
    color: "象牙白",
    price: 389,
    fit: "oversize",
    sizes: { M: 18, L: 12, XL: 5 },
  },
  brand_voice: "friendly_sister",
  approval_policy: "risky_only",
  customer_profile: {
    type: "老客户",
    last_size: "L",
    total_spend: 2847,
    tags: ["活跃用户", "高复购"],
  },
};

/** Minimum validator · 防空白 body */
export function validateInput(raw: unknown): UserInput | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "input must be object" };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.messages) || r.messages.length === 0)
    return { error: "messages required (at least one DM)" };
  if (!r.product || typeof r.product !== "object")
    return { error: "product required" };
  const p = r.product as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim())
    return { error: "product.name required" };
  return raw as UserInput;
}
