// src/components/institute/tools/research/ConfidenceSummary.tsx
//
// At-a-glance trust read: 3-cell hairline grid with verified / likely /
// unverified counts. Big serif italic numeral over mono uppercase label.

export interface ConfidenceSummaryProps {
  verified:   number;
  likely:     number;
  unverified: number;
}

export function ConfidenceSummary({ verified, likely, unverified }: ConfidenceSummaryProps) {
  return (
    <div className="grid grid-cols-3 border border-rule [&>*+*]:border-l [&>*+*]:border-l-rule">
      <Cell label="Verified"   count={verified}   tone="text-success" />
      <Cell label="Likely"     count={likely}     tone="text-amber"   />
      <Cell label="Unverified" count={unverified} tone="text-muted"   />
    </div>
  );
}

function Cell({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-5">
      <span className={['font-serif italic text-[28px] leading-none', tone].join(' ')}>
        {count}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
    </div>
  );
}
