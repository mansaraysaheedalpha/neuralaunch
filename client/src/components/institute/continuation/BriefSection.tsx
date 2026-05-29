import type { ReactNode } from 'react';

/**
 * BriefSection — one numbered section of the continuation brief.
 * 220px left column (§ roman + stamp) / 1fr right (italic-serif H2 +
 * body). Visual grammar: continuation.html section.section.
 */
export interface BriefSectionProps {
  /** Roman numeral, e.g. "I". */
  num: string;
  /** Mono stamp label, e.g. "What happened". */
  stamp: string;
  /** Section heading — ReactNode for italic-serif accents. */
  heading: ReactNode;
  id?: string;
  /** When true, suppress the top hairline (first section). */
  first?: boolean;
  children: ReactNode;
}

export function BriefSection({ num, stamp, heading, id, first, children }: BriefSectionProps) {
  return (
    <section
      id={id}
      className={[
        'grid gap-12 py-14 lg:grid-cols-[220px_1fr] lg:gap-16',
        first ? '' : 'border-t border-rule',
      ].filter(Boolean).join(' ')}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        <span className="mb-1.5 block font-serif text-[32px] not-italic [font-style:italic] tracking-[-0.01em] text-accent">
          {num}.
        </span>
        {stamp}
      </div>
      <div>
        <h2 className="mb-6 font-serif text-[clamp(34px,4vw,52px)] font-normal italic leading-[1.05] tracking-[-0.015em] text-fg [&_em]:text-accent">
          {heading}
        </h2>
        {children}
      </div>
    </section>
  );
}

/**
 * BriefProse — renders a brief prose string (whatHappened,
 * whatIGotWrong, whatTheEvidenceSays, closingThought) as paragraphs,
 * splitting on blank lines. Institute prose styling.
 */
export function BriefProse({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks = paragraphs.length > 0 ? paragraphs : [text];
  return (
    <div className="max-w-[780px]">
      {blocks.map((p, i) => (
        <p
          key={i}
          className="text-[17px] leading-[1.65] text-fg-2 [&+p]:mt-3.5 [&_em]:font-serif [&_em]:italic [&_em]:text-fg [&_strong]:font-medium [&_strong]:text-fg"
        >
          {p}
        </p>
      ))}
    </div>
  );
}
