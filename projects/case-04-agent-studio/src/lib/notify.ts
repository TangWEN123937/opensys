"use client";

import { toast } from "sonner";

export const notify = {
  // 真功能成功
  ok: (msg: string, desc?: string) => toast.success(msg, { description: desc }),
  err: (msg: string, desc?: string) => toast.error(msg, { description: desc }),
  info: (msg: string, desc?: string) => toast(msg, { description: desc }),

  // MVP 未实现 · 演示反馈
  todo: (feature: string) =>
    toast.info(`✨ ${feature}`, {
      description: "MVP 暂未实现 · 这是演示按钮 · 计划在 v0.2 接入",
      duration: 2600,
    }),

  // 真 API 调用 · 自动显示 loading + 结果
  promise: async <T>(
    fn: Promise<T>,
    msgs: { loading: string; success: string | ((r: T) => string); error: string | ((e: unknown) => string) },
  ): Promise<T> => {
    const id = toast.loading(msgs.loading);
    try {
      const r = await fn;
      toast.success(typeof msgs.success === "function" ? msgs.success(r) : msgs.success, { id });
      return r;
    } catch (e) {
      toast.error(typeof msgs.error === "function" ? msgs.error(e) : msgs.error, { id });
      throw e;
    }
  },
};
