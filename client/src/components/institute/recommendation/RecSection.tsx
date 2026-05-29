import type { ReactNode } from 'react';

/**
 * RecSection — the shared anatomy-section frame for the recommendation
 * page. A 200px left column (§ roman index + mono-caps label) and a
 * right column with an italic-serif H2 + body. Visual grammar:
 * recommendation.html section.field.
 */
export interface RecSectionProps {
  /** Roman numeral index, e.g. "I." — rendered as a serif italic accent. */
  num: string;
  /** Mono-caps section label, e.g. "Reasoning". */
  label: string;
  /**
   * Optional italic-serif H2. ReactNode so `<em>` accent works. Omit
   * for sections that lead straight into a ledger (assumptions, risks).
   */
  heading?: ReactNode;
  /** Whether this is the first section (drops the top rule + pad). */
  first?: boolean;
  children: ReactNode;
}

export function RecSection({ num, label, heading, first, children }: RecSectionProps) {
  return (
    <section
      className={[
        'grid gap-8 lg:grid-cols-[200px_1fr] lg:gap-14',
        first ? '' : 'border-t border-rule pt-9',
        'pb-9',
      ].filter(Boolean).join(' ')}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        <span className="mb-1.5 block font-serif text-[24px] not-italic [font-style:italic] tracking-[-0.01em] text-accent">
          {num}
        </span>
        {label}
      </div>
      <div>
        {heading && (
          <h2 className="mb-[18px] font-serif text-[30px] font-normal italic leading-[1.1] tracking-[-0.015em] text-fg [&_em]:text-accent">
            {heading}
          </h2>
        )}
        {children}
      </div>
    </section>
  );
}
