// src/app/stories/[slug]/page.tsx
//
// Public reader for a single transformation story. Server
// component, no auth, no tier gate. The redaction-apply happens
// inside loadPublicStoryBySlug — by the time this page sees the
// content, names + sensitive details are already stripped per
// the founder's own redaction edits.
//
// Notes the renderer below intentionally does NOT inherit from:
//   - "Your transformation report" header copy (private surface)
//   - The redaction editor / publish flow (private surface)
//   - Founder-name byline (we never expose author identity)

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { loadPublicStoryBySlug } from "@/lib/transformation/public";
import type {
  TransformationReport,
  DefaultSectionKey,
  OutcomeLabel,
} from "@/lib/transformation";

interface RouteParams { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const story = await loadPublicStoryBySlug(slug);
  if (!story) {
    return { title: "Story not found — NeuraLaunch" };
  }
  // Pull a one-line description for OG/Twitter previews. Use the
  // closingReflection (always populated, addressed to the founder
  // but reads fine as a story summary in second person).
  const description = (story.content.closingReflection ?? "").slice(0, 200);
  return {
    title: `${story.ventureName} — NeuraLaunch`,
    description,
    openGraph: {
      title:       `${story.ventureName} — NeuraLaunch`,
      description,
      type:        "article",
      siteName:    "NeuraLaunch",
    },
    twitter: {
      card:        "summary_large_image",
      title:       `${story.ventureName} — NeuraLaunch`,
      description,
    },
  };
}

const OUTCOME_DISPLAY: Record<OutcomeLabel, { label: string; chip: string }> = {
  shipped: {
    label: "SHIPPED",
    chip:  "border-success/40 bg-success/10 text-success",
  },
  walked_away: {
    label: "WALKED AWAY",
    chip:  "border-amber-500/40 bg-amber-500/10 text-amber-500",
  },
  pivoted: {
    label: "PIVOTED",
    chip:  "border-primary/40 bg-primary/10 text-primary",
  },
  learning: {
    label: "LEARNING",
    chip:  "border-slate-700 bg-slate-800/40 text-slate-300",
  },
};

const SECTION_TITLES: Record<DefaultSectionKey, string> = {
  startingPoint:     "Where they started",
  centralChallenge:  "The real thing they were stuck on",
  decisivePivots:    "Decisive pivots",
  whatYouLearned:    "What they learned",
  whatYouBuilt:      "What they built",
  honestStruggles:   "Honest struggles",
  endingPoint:       "Where they are now",
  closingReflection: "",  // rendered without a heading; sign-off card
};

export default async function PublicStoryPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const story = await loadPublicStoryBySlug(slug);
  if (!story) notFound();

  const outcome   = OUTCOME_DISPLAY[story.outcomeLabel];
  const readMin   = estimateReadMinutes(story.content);
  const published = new Date(story.publishedAt).toLocaleDateString(undefined, {
    month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-navy-950 text-slate-50 antialiased">
      <MarketingHeader />
      <main id="main" className="pt-16">
        <article className="border-b border-slate-800 bg-navy-950">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
            <Link
              href="/stories"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200"
            >
              <ArrowLeft className="size-4" />
              All stories
            </Link>

            <header className="mt-8 flex flex-col gap-3">
              <span className={["inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest", outcome.chip].join(" ")}>
                {outcome.label}
              </span>
              <h1 className="text-balance text-heading text-white">
                {story.ventureName}
              </h1>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{published}</span>
                <span aria-hidden="true">·</span>
                <span>{readMin} min read</span>
                <span aria-hidden="true">·</span>
                <span>A real founder&apos;s story</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
                Anonymised by the author. Names, businesses, and specific numbers redacted by their choice.
              </p>
            </header>

            <div className="mt-12 flex flex-col gap-10">
              {story.content.sectionOrder.map((key) => (
                <DefaultSection key={key} sectionKey={key} content={story.content} />
              ))}

              {story.content.customSections && story.content.customSections.length > 0 && (
                <div className="flex flex-col gap-10">
                  {story.content.customSections.map((cs, i) => (
                    <section key={i} className="flex flex-col gap-3">
                      <h2 className="text-xl font-semibold text-white">{cs.heading}</h2>
                      <Prose body={cs.body} />
                    </section>
                  ))}
                </div>
              )}
            </div>

            {/* Funnel CTA — every public reader is implicitly a
                marketing audience. The whole archive is funnel; the
                funnel CTA shouldn't hide. */}
            <div className="mt-16 rounded-2xl border border-primary/30 bg-primary/5 px-6 py-5 sm:px-8 sm:py-6">
              <p className="text-sm font-semibold text-white sm:text-base">
                Has this resonated?
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-300">
                NeuraLaunch is the system that wrote this — by interviewing the founder, committing to one direction, and walking with them through every step.
              </p>
              <Link
                href="/discovery"
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Start your own discovery
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}

function DefaultSection({
  sectionKey,
  content,
}: {
  sectionKey: DefaultSectionKey;
  content:    TransformationReport;
}) {
  const title = SECTION_TITLES[sectionKey];

  switch (sectionKey) {
    case "decisivePivots": {
      const pivots = content.decisivePivots;
      if (!pivots || pivots.length === 0) return null;
      return (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <ul className="flex flex-col gap-4">
            {pivots.map((p, i) => (
              <li
                key={i}
                className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-navy-900/40 px-5 py-4"
              >
                <p className="text-[15px] font-medium text-white">{p.moment}</p>
                <p className="text-[14px] leading-relaxed text-slate-300">{p.why}</p>
                <p className="text-[13px] italic leading-relaxed text-slate-400">{p.change}</p>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "closingReflection": {
      // Surface in second person, but the public framing is a
      // founder-to-reader sign-off, not a private addressed note.
      // The prose is unmodified; only the chrome differs.
      return (
        <section className="rounded-2xl border border-gold/20 bg-gold/5 px-6 py-5 sm:px-8 sm:py-6">
          <p className="text-[10px] uppercase tracking-widest text-gold/80 font-semibold">
            In closing
          </p>
          <div className="mt-3">
            <Prose body={content.closingReflection} />
          </div>
        </section>
      );
    }
    default: {
      const body = content[sectionKey];
      if (typeof body !== "string" || body.length === 0) return null;
      return (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <Prose body={body} />
        </section>
      );
    }
  }
}

function Prose({ body }: { body: string }) {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <div className="flex flex-col gap-4">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-200 sm:text-base"
        >
          {p}
        </p>
      ))}
    </div>
  );
}

/**
 * Read-time estimate in minutes. Counts every populated string
 * field across the report at ~220 wpm. Rounds to a minimum of 1
 * — a 30-second story still reads as "1 min read" rather than the
 * jarring "0 min read" alternative.
 */
function estimateReadMinutes(content: TransformationReport): number {
  const segments: string[] = [
    content.startingPoint     ?? "",
    content.centralChallenge  ?? "",
    content.whatYouLearned    ?? "",
    content.whatYouBuilt      ?? "",
    content.honestStruggles   ?? "",
    content.endingPoint       ?? "",
    content.closingReflection,
  ];
  if (content.decisivePivots) {
    for (const p of content.decisivePivots) {
      segments.push(p.moment, p.why, p.change);
    }
  }
  if (content.customSections) {
    for (const c of content.customSections) {
      segments.push(c.heading, c.body);
    }
  }
  const wordCount = segments.join(" ").split(/\s+/).filter((w) => w.length > 0).length;
  return Math.max(1, Math.round(wordCount / 220));
}
