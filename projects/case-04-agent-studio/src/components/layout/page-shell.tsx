"use client";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function PageShell({
  title,
  subtitle,
  actions,
  children,
  noPadding = false,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} subtitle={subtitle} actions={actions} />
        <main className={noPadding ? "flex-1" : "flex-1 p-6"}>{children}</main>
      </div>
    </div>
  );
}
