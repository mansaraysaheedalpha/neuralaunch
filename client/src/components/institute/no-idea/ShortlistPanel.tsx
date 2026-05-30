'use client';
// src/components/institute/no-idea/ShortlistPanel.tsx
//
// Right-rail panel for Stage 3 — the shortlist count + readiness
// meter. Big serif-italic N/CAP, italic-serif heading, progress bar,
// mono note about the threshold.

export interface ShortlistPanelProps {
  viable: number;
  /** Minimum viable count to unlock composition (3). */
  floor:  number;
  /** Display denominator (5 — SHORTLIST_CAP). */
  cap:    number;
}

export function ShortlistPanel({ viable, floor, cap }: ShortlistPanelProps) {
  const filledPct = Math.min(100, (viable / cap) * 100);
  const slotsOpen = Math.max(0, cap - viable);
  const headingPrefix =
    viable === 0       ? 'No pains' :
    viable === 1       ? 'One pain'  :
    viable === 2       ? 'Two pains' :
    viable === 3       ? 'Three pains' :
    viable === 4       ? 'Four pains' :
                         `${viable} pains`;
  const headingSuffix =
    slotsOpen === 0 ? 'Shortlist full.' :
    slotsOpen === 1 ? 'One slot open.'  :
                      `${slotsOpen} slots open.`;
  return (
    <div className="border border-rule bg-bg-2 px-5 py-[18px]">
      <div className="mb-3.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        <span>Shortlist</span>
        <span className="text-accent">Cap {cap}</span>
      </div>
      <div className="font-serif text-[48px] italic leading-none tracking-[-0.02em] text-accent">
        {viable}
        <span className="text-[24px] text-muted"> / {cap}</span>
      </div>
      <h4 className="mt-2 font-serif text-[20px] font-normal italic leading-[1.15] tracking-[-0.01em] text-fg [&_em]:text-accent">
        {headingPrefix} <em>viable.</em> {headingSuffix}
      </h4>
      <div className="relative mt-4 h-1 bg-rule">
        <div className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-500" style={{ width: `${filledPct}%` }} />
      </div>
      <p className="mt-3 font-mono text-[10px] leading-[1.6] tracking-[0.04em] text-muted">
        {viable < floor
          ? <>Rate at least one more pain at <span className="text-accent">≥ 3 / 3 / 3</span> to advance. Composition unlocks at {floor}.</>
          : <>Composition unlocks at {floor} — you can compose now.</>}
      </p>
    </div>
  );
}
