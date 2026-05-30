import type { EvidenceSignalRow } from '@/lib/continuation';

/**
 * EvidenceLedger — §III in the continuation brief. Renders the
 * signal rows as a metric / reading / signal-stamp grid (180/1fr/160).
 * The signal word renders in serif italic, colour-coded by class:
 *   strong   → green
 *   re_aim   → amber
 *   negative → accent
 *   capped   → amber  (smaller stamp word — "Cap'd")
 *   weak     → muted  (smaller stamp word)
 *
 * Visual grammar: continuation.html .evidence / .ev-row.
 */
export interface EvidenceLedgerProps {
  rows: EvidenceSignalRow[];
}

export function EvidenceLedger({ rows }: EvidenceLedgerProps) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-5 grid gap-0 border-t border-rule">
      {rows.map((row, i) => (
        <EvidenceRow key={i} row={row} />
      ))}
    </div>
  );
}

const SIGNAL_LABEL: Record<EvidenceSignalRow['signal'], string> = {
  strong:   'Strong',
  re_aim:   'Re-aim',
  negative: 'Negative',
  capped:   "Cap'd",
  weak:     'Weak',
};

const SIGNAL_TONE: Record<EvidenceSignalRow['signal'], string> = {
  strong:   'text-success',
  re_aim:   'text-amber',
  negative: 'text-accent',
  capped:   'text-amber',
  weak:     'text-muted',
};

function EvidenceRow({ row }: { row: EvidenceSignalRow }) {
  const smaller = row.signal === 'weak' || row.signal === 'capped';
  return (
    <div className="grid grid-cols-1 items-baseline gap-3 border-b border-rule py-[18px] sm:grid-cols-[180px_1fr_160px] sm:gap-6">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {row.metric}
      </span>
      <p className="max-w-[560px] text-[16px] leading-[1.5] text-fg-2 [&_strong]:font-medium [&_strong]:text-fg [&_em]:font-serif [&_em]:italic [&_em]:text-accent">
        {row.reading}
      </p>
      <span
        className={[
          'font-serif italic leading-none tracking-[-0.01em] sm:text-right',
          smaller ? 'text-[18px]' : 'text-[24px]',
          SIGNAL_TONE[row.signal],
        ].join(' ')}
      >
        {SIGNAL_LABEL[row.signal]}
      </span>
    </div>
  );
}
