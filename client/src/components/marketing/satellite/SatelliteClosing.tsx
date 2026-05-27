import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * SatelliteClosing — full-bleed closing block. Mono stamp at top-left,
 * massive H2 with italic-serif accent, optional paragraph, single
 * primary CTA. Matches about.html .closing + direction-a.html .closing
 * exactly.
 */

export interface SatelliteClosingProps {
  /** Mono stamp rendered in the 240px left column. Default "In closing". */
  stamp?: string;
  /**
   * Headline. ReactNode supports `<em>` for italic-serif accents.
   */
  heading: ReactNode;
  /** Optional paragraph beneath the heading. */
  body?: ReactNode;
  /**
   * Primary CTA. Provide an href + label, OR pass a fully-formed
   * ReactNode (e.g. a SubscribeButton) via `cta` for full control.
   */
  cta?: { href: string; label: string } | ReactNode;
  /** Mono caption beside / below the CTA. */
  quiet?: string;
}

export function SatelliteClosing({
  stamp = "In closing",
  heading,
  body,
  cta,
  quiet,
}: SatelliteClosingProps) {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] px-6 py-32 sm:px-10 lg:py-40">
        <div className="grid gap-12 lg:grid-cols-[240px_1fr] lg:gap-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            {stamp}
          </div>
          <div>
            <h2
              className="
                font-sans font-medium text-fg
                [font-size:clamp(48px,7vw,124px)] [line-height:0.94] [letter-spacing:-0.03em]
                [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent
              "
            >
              {heading}
            </h2>
            {body && (
              <p
                className="
                  mt-9 max-w-[540px] text-[18px] leading-[1.5] text-fg-2
                  [&_em]:font-serif [&_em]:italic [&_em]:text-fg
                "
              >
                {body}
              </p>
            )}
            {(cta || quiet) && (
              <div className="mt-12 flex flex-wrap items-center gap-3.5">
                {cta && isCtaSpec(cta) ? (
                  <Link
                    href={cta.href}
                    className="inline-flex items-center gap-3 bg-accent px-6 py-4 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5"
                  >
                    {cta.label}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : cta ? (
                  cta
                ) : null}
                {quiet && (
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                    {quiet}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function isCtaSpec(value: unknown): value is { href: string; label: string } {
  return (
    typeof value === "object"
    && value !== null
    && "href" in value
    && "label" in value
    && typeof (value as { href: unknown }).href === "string"
    && typeof (value as { label: unknown }).label === "string"
  );
}
