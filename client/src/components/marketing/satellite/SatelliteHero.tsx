import type { ReactNode } from "react";

/**
 * SatelliteHero — Institute satellite hero. 140px top padding, mono
 * stamp row above the H1, big Inter Tight H1 (supports `<em>` for
 * Instrument Serif italic accents), two-column standfirst with a
 * column rule. Radial accent wash sits behind. Visual grammar:
 * about.html hero.
 */

export interface SatelliteHeroStamp {
  /** Stamp text. */
  text: string;
  /**
   * When true, paint in --accent and prefix with a small live dot
   * (the green-success pulse from about.html). Default false.
   */
  live?: boolean;
}

export interface SatelliteHeroProps {
  /** 2–3 short mono stamps above the H1. */
  stamps?: SatelliteHeroStamp[];
  /**
   * Headline. ReactNode so consumers can pass `<>foo <em>bar</em></>`.
   */
  title: ReactNode;
  /**
   * Optional standfirst. ReactNode — consumers usually pass
   * `<><p>...</p><p>...</p></>`. Rendered in a two-column block with
   * a column rule, drop-cap on the first paragraph.
   */
  standfirst?: ReactNode;
}

export function SatelliteHero({ stamps, title, standfirst }: SatelliteHeroProps) {
  return (
    <section className="relative border-b border-rule">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 320px at 25% 30%, rgba(255,90,60,0.10), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-[1320px] px-6 pb-24 pt-28 sm:px-10 lg:pb-28 lg:pt-36">
        {stamps && stamps.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-6 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            {stamps.map((s, i) => (
              <span
                key={`${s.text}-${i}`}
                className={s.live ? "inline-flex items-center gap-2 text-success" : undefined}
              >
                {s.live && (
                  <span
                    aria-hidden="true"
                    className="inline-block size-[6px] animate-pulse rounded-full bg-success"
                    style={{ animationDuration: "1.6s" }}
                  />
                )}
                {s.text}
              </span>
            ))}
          </div>
        )}

        <h1
          className="
            font-sans font-medium text-fg
            [font-size:clamp(48px,7vw,108px)] [line-height:0.94] [letter-spacing:-0.03em]
            max-w-[1180px]
            [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent
          "
        >
          {title}
        </h1>

        {standfirst && (
          <div
            className="
              mt-12 max-w-[880px]
              text-[17px] leading-[1.65] text-fg-2
              md:columns-2 md:gap-12
              [&_p+p]:mt-3.5
              md:[column-rule:1px_solid_var(--rule)]
              [&_p:first-child::first-letter]:font-serif [&_p:first-child::first-letter]:text-[1.4em]
              [&_em]:font-serif [&_em]:italic [&_em]:text-fg
              [&_strong]:font-medium [&_strong]:text-fg
            "
          >
            {standfirst}
          </div>
        )}
      </div>
    </section>
  );
}
