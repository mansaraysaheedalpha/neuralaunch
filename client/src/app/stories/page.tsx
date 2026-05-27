// src/app/stories/page.tsx
//
// Public archive index — Institute editorial roster. One ledger row
// per published story; the typography carries the page until real
// imagery is added.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  EditorialPage,
  SatelliteHero,
  SatelliteSection,
  SatelliteClosing,
} from "@/components/marketing/satellite";
import { loadPublicStorySummaries } from "@/lib/transformation/public";
import type {
  PublicStorySummary,
} from "@/lib/transformation/public";
import type { OutcomeLabel } from "@/lib/transformation";

const ARCHIVE_TAKE = 50;

const STORIES_DESCRIPTION =
  "Every story below is from a real founder who completed a venture on NeuraLaunch. Names, businesses, and specifics are redacted by their author.";

export const metadata: Metadata = {
  title: "Real founders. Real journeys. — NeuraLaunch",
  description: STORIES_DESCRIPTION,
  openGraph: {
    title: "Real founders. Real journeys. — NeuraLaunch",
    description: STORIES_DESCRIPTION,
    type: "website",
    siteName: "NeuraLaunch",
  },
  twitter: {
    card: "summary_large_image",
    title: "Real founders. Real journeys. — NeuraLaunch",
    description: STORIES_DESCRIPTION,
  },
};

export default async function StoriesIndexPage() {
  const stories = await loadPublicStorySummaries({ take: ARCHIVE_TAKE });

  return (
    <EditorialPage>
      <SatelliteHero
        stamps={[
          { text: "NeuraLaunch / Stories" },
          { text: "Real cycles · real outcomes", live: true },
        ]}
        title={
          <>
            What founders have<br />
            <em>actually shipped.</em>
          </>
        }
        standfirst={
          <>
            <p>
              Every story below is from a real founder who completed a venture
              on NeuraLaunch. <strong>Names, businesses, and specific numbers
              are redacted by the author</strong> — the system never publishes
              anything the founder hasn&rsquo;t reviewed and approved.
            </p>
            <p>
              Light-touch editing only. No marketing polish, no &ldquo;before /
              after&rdquo; framing, no testimonials. <em>What happened</em> —
              told the way the founder told it back to the engine.
            </p>
          </>
        }
      />

      <SatelliteSection
        num="I."
        stamp="The roster"
        heading={
          <>
            {stories.length} stories.<br />
            <em>Read straight through.</em>
          </>
        }
        bottomRule={false}
      >
        <div aria-hidden="true" />
        <div>
          {stories.length === 0 ? (
            <EmptyState />
          ) : (
            <ol className="grid">
              {stories.map((story, i) => (
                <StoryRow
                  key={story.publicSlug}
                  story={story}
                  romanIdx={ROMAN_UPPER[i] ?? `${i + 1}.`}
                  firstChild={i === 0}
                />
              ))}
            </ol>
          )}
        </div>
      </SatelliteSection>

      <SatelliteClosing
        heading={
          <>
            Your story could be <em>next.</em>
          </>
        }
        body={
          <>
            One honest interview. One clear direction. The cycle that follows is
            what these founders <em>actually went through.</em>
          </>
        }
        cta={{ href: "/discovery", label: "Begin Discovery" }}
        quiet="Free to start · No card"
      />
    </EditorialPage>
  );
}

/* -------------------------------------------------------------------------- */
/*  Roster row                                                                */
/* -------------------------------------------------------------------------- */

function StoryRow({
  story,
  romanIdx,
  firstChild,
}: {
  story: PublicStorySummary;
  romanIdx: string;
  firstChild?: boolean;
}) {
  const status = STATUS[story.outcomeLabel];
  const dek = story.cardSummary?.openingQuote ?? story.cardSummary?.setup ?? "";

  return (
    <li
      className={[
        "group grid gap-8 py-7 transition-all duration-200",
        "lg:grid-cols-[60px_1fr_220px] lg:gap-12",
        firstChild ? "border-t border-rule-strong" : "border-t border-rule",
        "hover:pl-4",
      ].join(" ")}
    >
      <span className="font-serif text-[22px] italic leading-none tracking-[-0.01em] text-accent">
        {romanIdx}
      </span>
      <Link
        href={`/stories/${story.publicSlug}`}
        className="block max-w-[640px]"
      >
        <h3 className="font-sans text-[22px] font-medium leading-[1.2] tracking-[-0.015em] text-fg lg:text-[24px]">
          {story.ventureName}
        </h3>
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          A founder&rsquo;s story · {formatPublishedDate(story.publishedAt)}
        </p>
        {dek && (
          <p className="mt-4 max-w-[560px] font-serif text-[17px] italic leading-[1.45] text-fg-2">
            &ldquo;{dek}&rdquo;
          </p>
        )}
      </Link>
      <div className="flex items-baseline justify-between gap-3 lg:flex-col lg:items-end lg:justify-start">
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
            status.accent ? "text-accent" : "text-muted"
          }`}
        >
          {status.label}
        </span>
        <ArrowRight
          aria-hidden="true"
          className="size-4 text-muted transition-colors group-hover:text-accent"
        />
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="border border-rule px-9 py-12">
      <p className="font-serif text-[20px] italic leading-[1.45] text-fg-2">
        No published stories yet. The archive grows as founders complete
        ventures and choose to share.
      </p>
      <Link
        href="/discovery"
        className="mt-7 inline-flex items-center gap-2.5 border border-rule-strong px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
      >
        Start your own discovery
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Static helpers                                                            */
/* -------------------------------------------------------------------------- */

const STATUS: Record<OutcomeLabel, { label: string; accent: boolean }> = {
  shipped:     { label: "● Cycle shipped",   accent: true  },
  pivoted:     { label: "● Cycle pivoted",   accent: true  },
  walked_away: { label: "● Walked away",     accent: false },
  learning:    { label: "○ Cycle learning",  accent: false },
};

function formatPublishedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year:  "numeric",
      month: "short",
    }).toUpperCase();
  } catch {
    return "—";
  }
}

const ROMAN_UPPER = [
  "I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII.",
  "IX.", "X.", "XI.", "XII.", "XIII.", "XIV.", "XV.",
  "XVI.", "XVII.", "XVIII.", "XIX.", "XX.",
];
