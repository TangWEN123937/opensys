/**
 * 电商客服自动回复 · 10 步完整链路剧本
 * 场景：凌晨 02:14 顾客发来尺码咨询，Agent 全自主处理到审批发送
 *
 * 每个 step 都包含四层数据：
 *   - thought  agent 当前推理（显示在中栏）
 *   - tool     本步调用的工具（参数 + 返回）
 *   - artifact 本步产出的可视化中间产物（显示在右栏）
 *   - duration 本步预期耗时（auto-play 节奏）
 */

export type ArtifactType =
  | "inbound_dm"
  | "intent_tag"
  | "customer_profile"
  | "product_card"
  | "size_recommend"
  | "competitors"
  | "draft_variants"
  | "outfit_hero"
  | "approval"
  | "sent_message"
  | "wrap_report";

export interface ScriptStep {
  no: number;
  title: string;
  kind: "perception" | "thinking" | "tool" | "output" | "hitl";
  thought: string;
  tool: {
    name: string;
    params: Record<string, unknown>;
    result: Record<string, unknown>;
  };
  artifact: {
    type: ArtifactType;
    data: Record<string, unknown>;
  };
  durationMs: number;
  requiresApproval?: boolean;
}

/** 完整剧本 */
export const SCRIPT_ECOM_DM: ScriptStep[] = [
  {
    no: 1,
    title: "接收私信",
    kind: "perception",
    thought: "凌晨 02:14 有新私信进来 · 我得看看是什么需求",
    tool: {
      name: "inbox.poll",
      params: { source: "xiaohongshu", since: "last_poll" },
      result: {
        new_count: 1,
        messages: [
          {
            from: "张小姐",
            avatar_hue: 210,
            message: "姐妹这件T恤还有L码吗？我175的穿L还是XL？在线等急！",
            time: "02:14:33",
          },
        ],
      },
    },
    artifact: {
      type: "inbound_dm",
      data: {
        from: "张小姐",
        avatar_hue: 210,
        message: "姐妹这件T恤还有L码吗？我175的穿L还是XL？在线等急！",
        time: "02:14:33",
        platform: "xiaohongshu",
      },
    },
    durationMs: 1200,
  },
  {
    no: 2,
    title: "意图分类",
    kind: "thinking",
    thought: "先判断意图 · 这是典型的售前尺码咨询，需要走推荐流程",
    tool: {
      name: "llm.classify_intent",
      params: { text: "姐妹这件T恤还有L码吗？我175的穿L还是XL" },
      result: {
        intent: "pre_sale",
        sub_intent: "size_question",
        urgency: "medium",
        confidence: 0.92,
      },
    },
    artifact: {
      type: "intent_tag",
      data: {
        intent: "售前 · 尺码咨询",
        confidence: 0.92,
        urgency: "medium",
        reasoning: "用户明确询问库存+尺码，匹配 size_question 模式",
      },
    },
    durationMs: 1600,
  },
  {
    no: 3,
    title: "召回客户画像",
    kind: "tool",
    thought: "看看她是不是老客户 · 历史偏好很关键",
    tool: {
      name: "mem0.recall_customer",
      params: { source: "xiaohongshu", name: "张小姐" },
      result: {
        hit: true,
        total_spend_cny: 2847,
        last_order_size: "L",
        preference: "oversize",
        tags: ["活跃用户", "高复购", "尺码偏大"],
        last_chat: "2026-03-18",
      },
    },
    artifact: {
      type: "customer_profile",
      data: {
        name: "张小姐",
        type: "老客户",
        total_spend: 2847,
        last_size: "L",
        preference: "oversize",
        tags: ["活跃用户", "高复购", "尺码偏大"],
      },
    },
    durationMs: 1500,
  },
  {
    no: 4,
    title: "查商品信息",
    kind: "tool",
    thought: "查这件 T 恤的库存和规格参数",
    tool: {
      name: "shop.product_info",
      params: { sku: "TEE-OVR-WHT-2026SS" },
      result: {
        name: "Essential Oversize 圆领 T 恤 · 象牙白",
        price_cny: 389,
        sizes: { M: 18, L: 12, XL: 5 },
        fit: "oversize",
        measure: {
          M: { bust: 110, length: 70 },
          L: { bust: 116, length: 73 },
          XL: { bust: 122, length: 76 },
        },
      },
    },
    artifact: {
      type: "product_card",
      data: {
        name: "Essential Oversize 圆领 T 恤",
        color: "象牙白",
        price: 389,
        sizes: { M: 18, L: 12, XL: 5 },
        fit: "oversize",
      },
    },
    durationMs: 1200,
  },
  {
    no: 5,
    title: "尺码推荐",
    kind: "thinking",
    thought:
      "身高 175 · 上次买 L · 这款 oversize 偏大 · 若她想略合身 → L 仍稳，想更松 → XL · 给 L 为主推 XL 为备选",
    tool: {
      name: "llm.reason_size",
      params: {
        height: 175,
        last_size: "L",
        fit: "oversize",
        preference: "oversize",
      },
      result: {
        primary: "L",
        alt: "XL",
        confidence: 0.87,
        reasoning:
          "oversize 剪裁在 L 码胸围 116cm · 相比标准剪裁已放大 10cm · 足够 175cm 身高舒适",
      },
    },
    artifact: {
      type: "size_recommend",
      data: {
        primary: "L",
        alt: "XL",
        confidence: 0.87,
        height: 175,
        m_bust: 110,
        l_bust: 116,
      },
    },
    durationMs: 2000,
  },
  {
    no: 6,
    title: "竞品话术扫描",
    kind: "tool",
    thought: "看看同赛道博主是怎么推搭配的 · 找一些能抄的话术套路",
    tool: {
      name: "browser.scan_competitors",
      params: {
        urls: [
          "xhs.com/@alice",
          "xhs.com/@bob",
          "xhs.com/@cindy",
          "xhs.com/@dana",
          "xhs.com/@emma",
        ],
        parallel: true,
      },
      result: {
        scanned: 5,
        top_patterns: ["数字对比法", "人物故事法", "稀缺提醒法"],
        top_pairing: "白 T + 阔腿裤",
        engagement_signal: "街拍类 +31% 互动",
      },
    },
    artifact: {
      type: "competitors",
      data: {
        scanned: 5,
        top_pairing: "白 T + 阔腿裤",
        insight: "街拍类配图比纯商品图互动 +31%",
      },
    },
    durationMs: 2200,
  },
  {
    no: 7,
    title: "起草回复（3 变体）",
    kind: "thinking",
    thought: "用亲切姐妹语气起 3 个变体 · 各有侧重：尺码型 / 场景型 / 限量型",
    tool: {
      name: "llm.draft_reply",
      params: { brand_voice: "casual_sister", variants: 3 },
      result: {
        variants: [
          {
            tag: "尺码型",
            body:
              "姐妹你好呀～你 175 我们 L 码胸围 116cm 其实刚好微松版 · 如果你喜欢更阔的落肩感那选 XL · 库存只剩 5 件啦",
            match_score: 0.88,
          },
          {
            tag: "场景型",
            body:
              "175 身高建议 L 哈～ 下配阔腿裤或直筒牛仔裤都很好看 · 随便加个腰带就有层次 · 我给你看下搭配图",
            match_score: 0.94,
          },
          {
            tag: "限量型",
            body:
              "姐妹 L 码只剩 12 件 · XL 就 5 件啦 · 你这身高推 L · 犹豫就默认加购给你锁定库存哦～",
            match_score: 0.81,
          },
        ],
      },
    },
    artifact: {
      type: "draft_variants",
      data: {
        variants: [
          {
            tag: "尺码型",
            score: 0.88,
            body:
              "姐妹你好呀～你 175 我们 L 码胸围 116cm 其实刚好微松版 · 如果你喜欢更阔的落肩感那选 XL · 库存只剩 5 件啦",
          },
          {
            tag: "场景型",
            score: 0.94,
            body:
              "175 身高建议 L 哈～ 下配阔腿裤或直筒牛仔裤都很好看 · 随便加个腰带就有层次 · 我给你看下搭配图",
          },
          {
            tag: "限量型",
            score: 0.81,
            body:
              "姐妹 L 码只剩 12 件 · XL 就 5 件啦 · 你这身高推 L · 犹豫就默认加购给你锁定库存哦～",
          },
        ],
        winner: 1,
      },
    },
    durationMs: 2500,
  },
  {
    no: 8,
    title: "生成搭配主图",
    kind: "output",
    thought: "带一张主视觉搭配图 · 提升转化 · 暗色街拍风格",
    tool: {
      name: "image.generate",
      params: {
        prompt: "白 oversize T + 阔腿牛仔裤 · 夜感街拍",
        style: "cinematic_night",
      },
      result: {
        url: "/demo/04-outfit-hero.webp",
        size: "1280x720",
        gen_ms: 8400,
      },
    },
    artifact: {
      type: "outfit_hero",
      data: {
        url: "/demo/04-outfit-hero.webp",
        caption: "白 T + 阔腿裤 · 夜感街拍",
      },
    },
    durationMs: 2500,
  },
  {
    no: 9,
    title: "⚠️ 等待人工审批",
    kind: "hitl",
    thought: "带图回复 · 风险系数略高 · 按规矩等人审",
    tool: {
      name: "approval.wait",
      params: { timeout: "24h", channel: "inbox" },
      result: { status: "pending" },
    },
    artifact: {
      type: "approval",
      data: {
        preview_body:
          "175 身高建议 L 哈～ 下配阔腿裤或直筒牛仔裤都很好看 · 随便加个腰带就有层次 · 我给你看下搭配图",
        image_url: "/demo/04-outfit-hero.webp",
        target: "xiaohongshu @张小姐",
      },
    },
    durationMs: 0,
    requiresApproval: true,
  },
  {
    no: 10,
    title: "发送 · 更新记忆 · 记入周报",
    kind: "output",
    thought: "已批准 · 并发执行：发消息 + 更新客户画像 + 记入本周复盘",
    tool: {
      name: "batch[xhs.send + mem0.update + analytics.track]",
      params: {
        reply_body: "175 身高建议 L 哈…",
        image: "/demo/04-outfit-hero.webp",
      },
      result: {
        sent: {
          msg_id: "xhs_msg_2026_04_23_aa72",
          delivered_at: "02:15:04",
          read_at: null,
        },
        mem0: { profile_updated: true, new_note: "咨询过 TEE-OVR-WHT 2026SS" },
        weekly_report: { appended: true, row_id: 37 },
      },
    },
    artifact: {
      type: "sent_message",
      data: {
        to: "@张小姐",
        body:
          "175 身高建议 L 哈～ 下配阔腿裤或直筒牛仔裤都很好看 · 随便加个腰带就有层次 · 我给你看下搭配图",
        image_url: "/demo/04-outfit-hero.webp",
        delivered_at: "02:15:04",
        turnaround_sec: 31,
        weekly_report_row: 37,
      },
    },
    durationMs: 1600,
  },
];

export const TOTAL_STEPS = SCRIPT_ECOM_DM.length;
export const TOTAL_DURATION_MS = SCRIPT_ECOM_DM.reduce(
  (s, x) => s + x.durationMs,
  0
);
