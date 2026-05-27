import type { ReactNode } from "react";

/**
 * SatelliteSection — the shared section frame. 240px left column with
 * a § NN · stamp + a right column with the H2. Generous top/bottom
 * padding, bottom hairline rule. Children render in a second .body
 * grid with the same gutter so the column rhythm stays consistent.
 * Visual grammar: about.html .section + index.html section.
 */

export interface SatelliteSectionProps {
  /** Roman / numeric index — rendered as a serif italic accent above the stamp. */
  num: string;
  /** Stamp text — short topic label in mono caps. */
  stamp: string;
  /**
   * Section heading. ReactNode supports `<em>` for italic-serif accents.
   */
  heading: ReactNode;
  /** Optional id for in-page anchor links. */
  id?: string;
  /**
   * When false, suppresses the bottom hairline rule. Useful when this
   * section abuts a closing block that owns its own top rule.
   */
  bottomRule?: boolean;
  children: ReactNode;
}

export function SatelliteSection({
  num,
  stamp,
  heading,
  id,
  bottomRule = true,
  children,
}: SatelliteSectionProps) {
  return (
    <section
      id={id}
      className={[
        "scroll-mt-24",
        bottomRule ? "border-b border-rule" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="mx-auto max-w-[1320px] px-6 py-24 sm:px-10 lg:py-32">
        <header className="mb-14 grid items-end gap-12 border-b border-rule pb-8 lg:mb-16 lg:grid-cols-[240px_1fr] lg:gap-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            <span className="mb-1.5 block font-serif text-[24px] not-italic text-accent [font-style:italic] [letter-spacing:-0.01em]">
              {num}
            </span>
            {stamp}
          </div>
          <h2
            className="
              font-sans font-medium text-fg
              [font-size:clamp(40px,5.2vw,72px)] [line-height:1] [letter-spacing:-0.025em]
              [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent
            "
          >
            {heading}
          </h2>
        </header>

        <div className="grid gap-12 lg:grid-cols-[240px_1fr] lg:gap-16">
          {children}
        </div>
      </div>
    </section>
  );
}
