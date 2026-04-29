export function SiteFooter() {
  return (
    <footer className="relative mt-20 border-t border-ink-hair">
      <div className="container-pro py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] font-mono text-ink-lo">
        <div className="flex items-center gap-4">
          <span>基于 Hermes Agent · ACP 多 agent 协议</span>
          <span className="w-1 h-1 rounded-full bg-ink-lo" />
          <span>Claude Sonnet 4.6 / Opus 4.7</span>
          <span className="w-1 h-1 rounded-full bg-ink-lo" />
          <span>飞书 Gateway</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Case 06 · FF-SaaSBuilder</span>
          <span className="w-1 h-1 rounded-full bg-ink-lo" />
          <span>MIT License</span>
        </div>
      </div>
    </footer>
  );
}
