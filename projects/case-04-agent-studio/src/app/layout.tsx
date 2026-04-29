import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Studio · 通用 Agent 编排开发平台",
  description:
    "Agent Skills · MCP · Tool Calling · Model Router · Trace · Eval 一体化 · 可视化 Agent 编排工作台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-bg text-ink antialiased">
        {children}
        <Toaster position="top-right" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
      </body>
    </html>
  );
}
