// src/components/marketing/stories/StoriesStrip.tsx
//
// Marketing-landing strip showcasing the public transformation
// archive. Server component — fetches the most-recently-published
// stories at request time and renders them in a horizontal
// scroll-snap container.
//
// Renders nothing when no stories are published yet (empty
// archive). The marketing page just doesn't show this section at
// all on a clean install — better than rendering "Real founders.
// Real journeys." above an empty container, which would read as
// broken.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { loadPublicStorySummaries } from "@/lib/transformation/public";
import { StoryCard, type StoryCardVariant, type StoryCardSize } from "./StoryCard";

const STRIP_TAKE = 12;

export async function StoriesStrip() {
  const stories = await loadPublicStorySummaries({ take: STRIP_TAKE });
  if (stories.length === 0) return null;

  return (
    <section
      aria-labelledby="stories-heading"
      className="border-b border-slate-800 bg-navy-950"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold">
            What happens when someone takes the path
          </p>
          <h2
            id="stories-heading"
            className="mt-3 text-balance text-heading text-white"
          >
            Real founders. Real journeys.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
            Every story below is from a real founder who completed a venture on NeuraLaunch.
            Names, businesses, and specifics are redacted by their author.
          </p>
        </div>

        <div className="relative mt-12">
          {/* Horizontal scroll container. Native scroll-snap, no JS
              carousel. The right-edge gradient hints "more this way"
              without needing arrow controls — works on touch and
              mouse. */}
          <div
            className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:thin]"
            style={{
              maskImage: "linear-gradient(to right, black 0%, black 92%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to right, black 0%, black 92%, transparent 100%)",
            }}
          >
            {stories.map((story, i) => (
              <StoryCard
                key={story.publicSlug}
                story={story}
                variant={variantFor(i)}
                size={sizeFor(i)}
              />
            ))}
            {/* Trailing spacer so the last card scrolls fully into
                view past the right-edge fade. */}
            <div aria-hidden="true" className="w-4 shrink-0" />
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/stories"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            See all stories
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Cards 1, 3, 5, … (zero-indexed: 0, 2, 4, …) use the standard
 * pull-quote-on-top layout. Cards 2, 4, … (zero-indexed: 1, 3, …)
 * use the rotated opening-quote layout. Alternation breaks the
 * visual rhythm so the strip doesn't read as a wall of identical
 * cards.
 */
function variantFor(index: number): StoryCardVariant {
  return index % 2 === 0 ? "standard" : "rotated";
}

/**
 * Every fourth card (zero-indexed: 3, 7, 11, …) is featured —
 * 1.5× wider with the moderator note rendered. Subtle disruption
 * to the otherwise uniform sizing.
 */
function sizeFor(index: number): StoryCardSize {
  return (index + 1) % 4 === 0 ? "featured" : "default";
}
