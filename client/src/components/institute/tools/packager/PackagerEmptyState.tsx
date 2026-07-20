interface PackagerEmptyStateProps { status?: string; active?: boolean; }

export function PackagerEmptyState({ status = 'Awaiting situation', active }: PackagerEmptyStateProps) {
  return (
    <section className="flex min-h-[420px] flex-col px-6 py-8 sm:px-10">
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <span>02 · Package</span><span className={active ? 'text-accent' : ''}>{status}</span>
      </div>
      <div className="my-auto flex min-h-[280px] flex-col items-center justify-center border border-dashed border-rule-strong px-8 text-center">
        <span aria-hidden="true" className={`font-serif text-[46px] italic ${active ? 'animate-pulse text-accent' : 'text-muted-2'}`}>❘❘❘</span>
        <p className="mt-5 font-mono text-[10px] uppercase leading-[1.8] tracking-[0.16em] text-muted">Three priced tiers appear here.<br />Each one reasoned and revenue-modelled.</p>
      </div>
    </section>
  );
}
