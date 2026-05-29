import type { ReactNode } from 'react';

/**
 * ClosingThought — the brief's closing pull-quote. Bordered, accent-
 * soft gradient, centred serif-italic quote + mono cite. Visual
 * grammar: continuation.html .closing-thought.
 */
export interface ClosingThoughtProps {
  quote: ReactNode;
  cite: string;
}

export function ClosingThought({ quote, cite }: ClosingThoughtProps) {
  return (
    <div
      className="mt-16 border border-rule px-7 py-12 text-center sm:px-14"
      style={{ background: 'linear-gradient(180deg, rgba(255,90,60,0.04), transparent 80%)' }}
    >
      <p className="mb-[18px] font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Closing thought
      </p>
      <blockquote className="mx-auto max-w-[780px] font-serif text-[clamp(28px,3.4vw,44px)] italic leading-[1.2] tracking-[-0.015em] text-fg [&_em]:not-italic [&_em]:text-accent">
        {quote}
      </blockquote>
      <cite className="mt-[22px] block font-mono text-[11px] not-italic uppercase tracking-[0.14em] text-muted">
        {cite}
      </cite>
    </div>
  );
}
