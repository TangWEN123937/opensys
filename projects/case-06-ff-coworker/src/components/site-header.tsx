import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="relative z-30 border-b border-ink-hair">
      <div className="container-pro flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-ink text-canvas font-display text-lg leading-none">
            协
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[17px] text-ink tracking-tight">FF-CoWorker</span>
            <span className="font-mono text-[10px] text-ink-lo mt-1 tracking-widest uppercase">
              Solo · 6 AI Employees
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 font-sans text-sm text-ink-soft">
          <Link href="/office"       className="hover:text-warmth transition">办公室</Link>
          <Link href="/employee/ava" className="hover:text-warmth transition">员工</Link>
          <Link href="/scenarios"    className="hover:text-warmth transition">落地场景</Link>
          <Link href="/feishu"       className="hover:text-warmth transition">飞书指挥</Link>
          <Link href="/settings"     className="hover:text-warmth transition">设置</Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-ink-mid">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-sage breathe-sage" />
            <span>6 / 6 在岗</span>
          </div>
          <Link href="/office" className="btn-primary !py-2 !px-4 !text-xs">
            进入办公室 →
          </Link>
        </div>
      </div>
    </header>
  );
}
