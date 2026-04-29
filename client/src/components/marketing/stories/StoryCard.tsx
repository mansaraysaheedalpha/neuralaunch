// src/components/marketing/stories/StoryCard.tsx
//
// Single story card used by both the marketing strip and the
// /stories index. Pure server-renderable — no client state,
// just JSX. Brand surface; entirely typographic.
//
// Two layout variants:
//   - 'standard'  — opening pull-quote at top, setup paragraph
//                    below, closing quote at bottom
//   - 'rotated'   — opening pull-quote rotated 90° on the left,
//                    setup + closing on the right (used in
//                    cards 2, 4, … to break the visual rhythm)
//
// And a 'featured' size variant (1.5× wider, with an optional
// moderatorNote line) used every 4-5 cards on the strip.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type {
  PublicStorySummary,
} from "@/lib/transformation/public";
import type { OutcomeLabel } from "@/lib/transformation";

export type StoryCardVariant = "standard" | "rotated";
export type StoryCardSize    = "default" | "featured";

const OUTCOME_DISPLAY: Record<OutcomeLabel, { label: string; chip: string; border: string }> = {
  shipped: {
    label:  "SHIPPED",
    chip:   "border-success/40 bg-success/10 text-success",
    border: "border-success/30",
  },
  walked_away: {
    label:  "WALKED AWAY",
    chip:   "border-amber-500/40 bg-amber-500/10 text-amber-500",
    border: "border-amber-500/30",
  },
  pivoted: {
    label:  "PIVOTED",
    chip:   "border-primary/40 bg-primary/10 text-primary",
    border: "border-primary/30",
  },
  learning: {
    label:  "LEARNING",
    chip:   "border-slate-700 bg-slate-800/40 text-slate-300",
    border: "border-slate-800",
  },
};

export interface StoryCardProps {
  story:   PublicStorySummary;
  variant: StoryCardVariant;
  size:    StoryCardSize;
}

export function StoryCard({ story, variant, size }: StoryCardProps) {
  const outcome = OUTCOME_DISPLAY[story.outcomeLabel];
  const card    = story.cardSummary;
  const moderatorNote = card?.moderatorNote ?? null;

  // Defensive empty-state — renders a minimal "placeholder" card
  // when cardSummary failed to parse OR is absent. Never breaks
  // the strip layout. In practice, a row missing cardSummary
  // shouldn't be in publishState='public' (the moderator flow
  // requires the field), but the safety net costs nothing.
  if (!card) {
    return (
      <article
        className={[
          "flex shrink-0 flex-col gap-4 rounded-2xl border bg-navy-900/60 p-6 backdrop-blur-sm",
          outcome.border,
          sizeClassesFor(size),
        ].join(" ")}
      >
        <span className={["inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest", outcome.chip].join(" ")}>
          {outcome.label}
        </span>
        <p className="text-sm leading-relaxed text-slate-300">
          A founder&apos;s story. <Link href={`/stories/${story.publicSlug}`} className="text-primary hover:underline">Read full story →</Link>
        </p>
      </article>
    );
  }

  if (variant === "rotated") {
    return (
      <article
        aria-labelledby={`story-title-${story.publicSlug}`}
        className={[
          "group flex shrink-0 flex-row gap-5 rounded-2xl border bg-navy-900/60 p-6 backdrop-blur-sm transition-colors hover:border-slate-600",
          outcome.border,
          sizeClassesFor(size),
        ].join(" ")}
      >
        {/* Rotated opening pull-quote on the left side. The
            writing-mode CSS rotates the text 90° counter-clockwise
            so the quote reads bottom-to-top. */}
        <div className="flex shrink-0 items-stretch">
          <p
            className="text-balance whitespace-nowrap font-serif text-base italic text-gold sm:text-lg"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            &ldquo;{card.openingQuote}&rdquo;
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <span className={["inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest", outcome.chip].join(" ")}>
            {outcome.label}
          </span>
          <p
            id={`story-title-${story.publicSlug}`}
            className="text-[14px] leading-relaxed text-slate-300"
          >
            {card.setup}
          </p>
          <hr className="border-slate-800" />
          {size === "featured" && moderatorNote && (
            <p className="text-[11px] uppercase tracking-wider text-primary/80">
              Why this story matters: <span className="font-semibold text-slate-200">{moderatorNote}</span>
            </p>
          )}
          <p className="text-[15px] leading-relaxed text-white">
            &ldquo;{card.closingQuote}&rdquo;
          </p>
          <Link
            href={`/stories/${story.publicSlug}`}
            className="mt-auto inline-flex items-center gap-1 text-[12px] font-medium text-primary transition-colors group-hover:text-primary/80"
          >
            Read full story
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </article>
    );
  }

  // Standard layout
  return (
    <article
      aria-labelledby={`story-title-${story.publicSlug}`}
      className={[
        "group flex shrink-0 flex-col gap-4 rounded-2xl border bg-navy-900/60 p-6 backdrop-blur-sm transition-colors hover:border-slate-600",
        outcome.border,
        sizeClassesFor(size),
      ].join(" ")}
    >
      <span className={["inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest", outcome.chip].join(" ")}>
        {outcome.label}
      </span>

      <p
        id={`story-title-${story.publicSlug}`}
        className="text-balance font-serif text-lg italic leading-snug text-gold sm:text-xl"
      >
        &ldquo;{card.openingQuote}&rdquo;
      </p>

      <p className="text-[14px] leading-relaxed text-slate-300">
        {card.setup}
      </p>

      <hr className="border-slate-800" />

      {size === "featured" && moderatorNote && (
        <p className="text-[11px] uppercase tracking-wider text-primary/80">
          Why this story matters:{" "}
          <span className="font-semibold normal-case tracking-normal text-slate-200">
            {moderatorNote}
          </span>
        </p>
      )}

      <p className="text-[15px] leading-relaxed text-white">
        &ldquo;{card.closingQuote}&rdquo;
      </p>

      <Link
        href={`/stories/${story.publicSlug}`}
        className="mt-auto inline-flex items-center gap-1 text-[12px] font-medium text-primary transition-colors group-hover:text-primary/80"
      >
        Read full story
        <ArrowRight className="size-3.5" />
      </Link>
    </article>
  );
}

/**
 * Size-and-snap classes for the strip layout. The card widths are
 * anchored in rems so they stay legible across typography scales;
 * the strip parent controls the horizontal scroll-snap behaviour.
 */
function sizeClassesFor(size: StoryCardSize): string {
  if (size === "featured") {
    return "w-[24rem] sm:w-[30rem] snap-center";
  }
  return "w-[20rem] sm:w-[22rem] snap-center";
}
