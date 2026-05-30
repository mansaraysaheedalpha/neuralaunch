import type { OverturnedAssumptionItem } from '@/lib/continuation';

/**
 * OverturnedAssumption — §II row in the continuation brief. The
 * original recommendation assumption appears struck-through in serif,
 * the "Actually:" counter-finding sits beneath in body text with
 * accent emphasis on the key reversal, and a status stamp + ✕ glyph
 * top-right communicate the verdict at a glance.
 *
 * Visual grammar: continuation.html .wrong-item.
 *
 * Renders nothing when handed an empty array — §II is then "every
 * assumption held" and the brief omits the section.
 */
export interface OverturnedAssumptionListProps {
  items: OverturnedAssumptionItem[];
}

export function OverturnedAssumptionList({ items }: OverturnedAssumptionListProps) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5 grid gap-3.5">
      {items.map((item, i) => (
        <OverturnedAssumption key={i} item={item} />
      ))}
    </div>
  );
}

function OverturnedAssumption({ item }: { item: OverturnedAssumptionItem }) {
  const status = item.status;
  const statusLabel = status === 'overturned' ? 'overturned' : 'partially upheld';
  const statusTone = status === 'overturned' ? 'text-accent' : 'text-amber';
  return (
    <article className="relative border border-rule bg-bg-2 px-6 py-5">
      <span
        aria-hidden="true"
        className="absolute right-6 top-[18px] font-serif text-[24px] italic text-accent"
      >
        ✕
      </span>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Assumption <span className={statusTone}>{statusLabel}</span>
      </div>
      <p className="mb-2.5 max-w-[660px] font-serif text-[18px] leading-[1.4] text-fg-2 line-through decoration-muted-2">
        &ldquo;{item.assumption}&rdquo;
      </p>
      <p className="max-w-[680px] text-[15px] leading-[1.55] text-fg [&_strong]:font-medium [&_strong]:text-fg [&_em]:font-serif [&_em]:italic [&_em]:text-accent">
        <b className="font-medium text-accent">Actually:</b> {item.actually}
      </p>
    </article>
  );
}
