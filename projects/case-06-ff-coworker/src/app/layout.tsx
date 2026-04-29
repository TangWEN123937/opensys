import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FF-CoWorker · 一人公司 AI 员工系统",
  description:
    "6 个 AI 员工 · 1 个老板 · 飞书远程指挥 · Anthropic Context Engineering 8 大机制可视化 · 基于 Hermes Agent",
  applicationName: "FF-CoWorker",
};

export const viewport: Viewport = {
  themeColor: "#FBF7F1",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="antialiased">
      <body className="min-h-screen relative">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
