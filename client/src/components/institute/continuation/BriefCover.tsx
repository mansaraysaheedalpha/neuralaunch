import type { ReactNode } from 'react';

/**
 * BriefCover — the continuation brief's cover. Mono stamp row (cycle +
 * completion + ready dot), the big "What you learned." H1, and an
 * optional hairline stats grid. Visual grammar: continuation.html .cover.
 *
 * The stats grid is OPTIONAL because the continuation GET payload does
 * not currently carry the reconciled roadmap figures (tasks complete,
 * derived hours, validation signal) — see PR notes. When that data is
 * threaded through, pass `stats` and the grid renders.
 */
export interface BriefStat {
  k: string;
  v: ReactNode;
  sub?: string;
  accent?: boolean;
}

export interface BriefCoverProps {
  /** Roman cycle numeral, e.g. "I". */
  cycleRoman: string;
  /** Right-hand stamp, e.g. "Day 21 of 21 · cycle complete". */
  progressStamp?: string;
  heading: ReactNode;
  stats?: BriefStat[];
}

export function BriefCover({ cycleRoman, progressStamp, heading, stats }: BriefCoverProps) {
  return (
    <section className="max-w-[1280px] border-b border-rule px-6 pb-14 pt-16 sm:px-12 lg:px-20">
      <div className="mb-8 flex flex-wrap gap-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        <span>Continuation Brief · Cycle {cycleRoman}</span>
        {progressStamp && <span className="text-muted">{progressStamp}</span>}
        <span className="inline-flex items-center gap-[7px] text-success">
          <span aria-hidden="true" className="inline-block size-[6px] rounded-full bg-success" />
          Ready to read
        </span>
      </div>

      <h1 className="font-sans text-fg [font-size:clamp(48px,7vw,116px)] [font-weight:500] [line-height:0.94] [letter-spacing:-0.03em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
        {heading}
      </h1>

      {stats && stats.length > 0 && (
        <div className="mt-12 grid grid-cols-1 border border-rule sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.k}
              className="border-b border-rule px-6 py-[22px] last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(odd)]:border-rule lg:border-b-0 lg:border-r lg:border-rule lg:last:border-r-0"
            >
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{s.k}</div>
              <div className={`font-serif text-[32px] italic leading-none tracking-[-0.01em] ${s.accent ? 'text-accent' : 'text-fg'}`}>
                {s.v}
              </div>
              {s.sub && <div className="mt-1.5 font-mono text-[10px] tracking-[0.04em] text-muted-2">{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
