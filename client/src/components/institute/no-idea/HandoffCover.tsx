// src/components/institute/no-idea/HandoffCover.tsx
//
// Stage 5 cover. Mono stamp row (Stage V · status · ready dot) +
// massive H1 ("One chosen. Four held."). The cover REPLACES the
// StageBanner here — Stage 5 is a terminal document stage and the
// audit calls for the cover treatment instead of the dismissable
// banner.

export interface HandoffCoverProps {
  /** Right-hand stamp; defaults to "Pre-synthesis review". */
  statusLabel?: string;
}

export function HandoffCover({ statusLabel = 'Pre-synthesis review' }: HandoffCoverProps) {
  return (
    <section className="max-w-[1320px] border-b border-rule px-6 pb-14 pt-16 sm:px-12 lg:px-20">
      <div className="mb-8 flex flex-wrap gap-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        <span>
          Stage <span className="text-accent">V</span> of V · Validation Handoff
        </span>
        <span className="text-muted">{statusLabel}</span>
        <span className="inline-flex items-center gap-[7px] text-success">
          <span aria-hidden="true" className="inline-block size-[6px] rounded-full bg-success" />
          Ready to commit
        </span>
      </div>
      <h1 className="font-sans text-fg [font-size:clamp(48px,7vw,116px)] [font-weight:500] [line-height:0.94] [letter-spacing:-0.03em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
        One chosen.<br />
        <em>Four held.</em>
      </h1>
    </section>
  );
}
