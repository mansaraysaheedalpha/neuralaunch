import type { ReactNode } from "react";

/**
 * SatelliteFAQItem — single Q&A row. Roman index in italic serif,
 * question in 17–18px sans 500 (supports italic-serif accents via
 * <em>), answer below in 15px body grey. Hairline rule on top; the
 * last item in a cluster gets a bottom rule via parent class.
 *
 * Always-open — there is no accordion. The FAQ is short enough to read
 * straight through.
 */

export interface SatelliteFAQItemProps {
  /** Roman index (i., ii., iii., ...) shown in italic serif on the left. */
  roman: string;
  /** Question text. ReactNode supports `<em>` for italic-serif accents. */
  question: ReactNode;
  /** Answer text. */
  answer: ReactNode;
}

export function SatelliteFAQItem({ roman, question, answer }: SatelliteFAQItemProps) {
  return (
    <li className="grid gap-6 border-t border-rule py-9 last:border-b last:border-rule lg:grid-cols-[60px_1fr] lg:gap-12">
      <span className="font-serif text-[18px] italic leading-none tracking-[-0.01em] text-accent">
        {roman}
      </span>
      <div className="max-w-[60ch]">
        <p
          className="
            font-sans text-[18px] font-medium leading-[1.35] tracking-[-0.01em] text-fg
            [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent
          "
        >
          {question}
        </p>
        <div
          className="
            mt-3.5 text-[15px] leading-[1.65] text-fg-2
            [&_em]:font-serif [&_em]:italic [&_em]:text-fg
            [&_strong]:font-medium [&_strong]:text-fg
          "
        >
          {answer}
        </div>
      </div>
    </li>
  );
}
