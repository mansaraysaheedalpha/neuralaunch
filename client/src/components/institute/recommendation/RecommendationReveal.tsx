import type { ReactNode } from 'react';

/**
 * RecommendationReveal — the headline moment. Stamp row, big Inter
 * Tight H1, optional confidence corner, and a two-column serif-emphasis
 * reflection with a drop-cap per column. Visual grammar:
 * recommendation.html .reveal.
 *
 * The synthesis schema has no `confidence` field, so the confidence
 * corner only renders when the consumer passes one (see PR notes). The
 * H1 supports `<em>` italic-serif accent if the source ever emits
 * markup; today `path` is plain text and renders verbatim.
 */
export interface RecommendationRevealProps {
  /** Short id shown in the "Recommendation No." stamp (accent). */
  shortId: string;
  /** "Cycle I · Path I (No Idea)" style middle stamp. */
  pathStamp: string;
  /** The committed direction — the H1. Plain text or ReactNode. */
  headline: ReactNode;
  /** 2–3 sentence reflection, flowed into two columns. */
  reflection: string;
  /** Optional confidence label (e.g. "High") — omitted when absent. */
  confidence?: string;
  /** Version mark, e.g. "Original" / "Mark 2 of 2" — shown in the stamp. */
  versionLabel?: string;
}

export function RecommendationReveal({
  shortId,
  pathStamp,
  headline,
  reflection,
  confidence,
  versionLabel,
}: RecommendationRevealProps) {
  const paragraphs = reflection.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <section className="relative mb-14 border-b border-rule pb-14">
      <div className="mb-8 flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        <span>
          Recommendation No. <span className="text-accent">{shortId}</span>
        </span>
        <span>{pathStamp}</span>
        <span className="inline-flex items-center gap-[7px]">
          <span aria-hidden="true" className="inline-block size-[6px] rounded-full bg-success" />
          Ready
        </span>
        {versionLabel && <span>{versionLabel}</span>}
      </div>

      <h1 className="mb-[30px] max-w-[1000px] font-sans text-fg [font-size:clamp(40px,5.6vw,76px)] [font-weight:500] [line-height:1] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
        {headline}
      </h1>

      {confidence && (
        <div className="absolute right-0 top-0 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span>Confidence</span>
          <span className="mt-1 block font-serif text-[32px] italic tracking-[-0.01em] text-accent">
            {confidence}
          </span>
        </div>
      )}

      <div
        className="
          max-w-[800px] text-[17px] leading-[1.6] text-fg-2
          md:columns-2 md:gap-10 md:[column-rule:1px_solid_var(--rule)]
          [&_p+p]:mt-3
          [&_p:first-letter]:font-serif [&_p:first-letter]:text-[1.4em]
          [&_strong]:font-medium [&_strong]:text-fg
        "
      >
        {(paragraphs.length > 0 ? paragraphs : [reflection]).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}
