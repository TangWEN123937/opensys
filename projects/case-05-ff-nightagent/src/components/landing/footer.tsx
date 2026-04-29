import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BreathingDot } from "@/components/motion/breathing-dot";

export function Footer() {
  return (
    <footer className="relative border-t border-stroke px-4 sm:px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <Logo />
            <p className="mt-3 text-xs text-text-lo max-w-sm">
              <span className="font-mono">FF-SaaSBuilder</span> 的直播课程案例 ·
              由 Next.js 16 · Claude Agent SDK · 本地 SQLite 构建，完全离线可跑。
            </p>
          </div>

          <div className="flex flex-wrap gap-5 text-sm text-text-mid">
            <FooterLink href="/dashboard">工作台</FooterLink>
            <FooterLink href="#features">功能</FooterLink>
            <FooterLink href="#how">怎么用</FooterLink>
            <FooterLink href="#pricing">定价</FooterLink>
            <FooterLink href="https://github.com">GitHub</FooterLink>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-6 border-t border-stroke text-xs text-text-lo font-mono">
          <div className="flex items-center gap-2">
            <BreathingDot size="xs" />
            <span>系统时间 · 2026-04-23 00:42 CST</span>
          </div>
          <div>© 2026 · FF-Autopilot · 教学演示项目</div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="hover:text-white transition-colors">
      {children}
    </Link>
  );
}
