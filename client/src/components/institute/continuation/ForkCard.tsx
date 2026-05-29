'use client';

import type { ContinuationFork } from '@/lib/continuation';

/**
 * ForkCard — one next-cycle fork. Letter stamp + title + rationale +
 * a hairline-topped first-step / estimate / right-if grid + a pick
 * button. Selectable: selected state shows an accent top-border +
 * accent gradient + filled pick button. Visual grammar:
 * continuation.html .fork.
 *
 * NOTE: the schema has no `kind` (deepen/widen/package) field, so the
 * stamp shows the letter only — no kind label (see PR notes). A
 * `sourceReserveId` renders a small "pivot to reserve" tag.
 */
export interface ForkCardProps {
  fork: ContinuationFork;
  /** Letter index — "A", "B", "C". */
  letter: string;
  selected: boolean;
  onSelect: () => void;
}

export function ForkCard({ fork, letter, selected, onSelect }: ForkCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'relative flex flex-col overflow-hidden border bg-bg-2 px-6 pb-6 pt-[22px] text-left transition-[border-color,transform] hover:-translate-y-0.5',
        selected ? 'border-accent' : 'border-rule hover:border-rule-strong',
      ].join(' ')}
      style={selected ? { background: 'linear-gradient(180deg, rgba(255,90,60,0.10), var(--bg-2) 60%)' } : undefined}
    >
      {selected && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}

      <div className="mb-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        <span className="font-serif text-[18px] not-italic [font-style:italic] tracking-[-0.01em] text-accent">
          {letter}.
        </span>
        {fork.sourceReserveId && <span className="text-accent">Pivot · reserve</span>}
      </div>

      <h3 className="mb-3 font-sans text-[22px] font-medium leading-[1.15] tracking-[-0.015em] text-fg">
        {fork.title}
      </h3>

      <p className="mb-[18px] flex-1 text-[14px] leading-[1.55] text-fg-2">{fork.rationale}</p>

      <div className="grid gap-2.5 border-t border-rule pt-3.5">
        <Row label="First step" value={fork.firstStep} />
        <Row label="Estimate" value={fork.timeEstimate} />
        <Row label="Right if" value={fork.rightIfCondition} serif />
      </div>

      <span
        className={[
          'mt-[18px] inline-flex items-center justify-between px-3.5 py-[11px] font-mono text-[10px] uppercase tracking-[0.14em]',
          selected ? 'bg-accent text-bg' : 'border border-rule-strong text-fg',
        ].join(' ')}
      >
        {selected ? '✓ Selected' : `Choose ${letter}`}
        {!selected && <span aria-hidden="true">→</span>}
      </span>
    </button>
  );
}

function Row({ label, value, serif }: { label: string; value: string; serif?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 font-mono text-[11px] tracking-[0.04em] leading-[1.45] text-muted">
      <b className="font-medium text-fg">{label}</b>
      <span
        className={
          serif
            ? 'font-serif text-[13px] italic normal-case leading-[1.4] tracking-normal text-fg-2'
            : 'text-fg-2'
        }
      >
        {value}
      </span>
    </div>
  );
}
