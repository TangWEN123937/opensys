import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * 顶部 NEW 提示条
 */
export function BannerPill() {
  return (
    <div className="pt-24 flex justify-center px-4">
      <Link
        href="#features"
        className="group inline-flex items-center gap-2 rounded-full border border-stroke-strong bg-white/[0.03] px-4 py-1.5 text-xs text-text-mid hover:border-alive/40 hover:text-white transition-all"
      >
        <Sparkles className="h-3 w-3 text-alive" />
        <span>
          <span className="font-semibold text-white">NEW</span>
          <span className="mx-2 text-text-lo">·</span>
          <span>基于 Claude 4.7 Opus · 1M 上下文 + Computer Use</span>
        </span>
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
