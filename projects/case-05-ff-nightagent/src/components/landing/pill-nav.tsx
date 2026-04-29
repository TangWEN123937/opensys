import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";

/**
 * 悬浮 pill nav —— Raycast 风
 */
export function PillNav() {
  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(calc(100%-24px),1120px)]">
      <nav className="glass-strong flex items-center justify-between rounded-full pl-5 pr-2 py-2">
        <Link href="/" aria-label="首页" className="flex items-center">
          <Logo />
        </Link>

        <div className="hidden md:flex items-center gap-1 text-sm text-text-mid">
          <NavLink href="#features">功能</NavLink>
          <NavLink href="#how">怎么用</NavLink>
          <NavLink href="#pricing">定价</NavLink>
          <NavLink href="/dashboard">工作台</NavLink>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex rounded-full">
            文档
          </Button>
          <Button variant="accent" size="sm" className="rounded-full gap-1" asChild>
            <Link href="/dashboard" className="flex items-center gap-1">
              试玩 Demo <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full px-3.5 py-1.5 text-text-mid hover:text-white hover:bg-white/5 transition-colors"
    >
      {children}
    </Link>
  );
}
