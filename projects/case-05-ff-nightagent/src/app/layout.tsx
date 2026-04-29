import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FF-Autopilot · 你的目标自驾代理",
  description:
    "7×24 小时无人值守 AI Agent · 设定目标，松开方向盘 · 目标驱动 · HITL 接管 · 行车记录回放 · Claude 4.7 Opus 1M",
  applicationName: "FF-Autopilot",
};

export const viewport: Viewport = {
  themeColor: "#0A0A0F",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="antialiased">
      <body className="min-h-screen bg-void text-text-hi selection:bg-alive/30">
        {children}
      </body>
    </html>
  );
}
