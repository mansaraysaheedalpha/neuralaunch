// src/app/stories/[slug]/page.tsx
//
// Public reader for a single transformation story — Institute
// editorial treatment. Two-column body (prose left, sticky meta panel
// right), drop-cap on the first paragraph, hairline rules between
// sections. The redaction-apply happens inside loadPublicStoryBySlug —
// by the time this page sees content, names + sensitive details are
// already stripped per the founder's redaction edits.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  EditorialPage,
  SatelliteClosing,
} from "@/components/marketing/satellite";
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
  if (!story) return { title: "Story not found — NeuraLaunch" };
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

const STATUS_LABEL: Record<OutcomeLabel, string> = {
  shipped:     "Cycle shipped",
  walked_away: "Walked away",
  pivoted:     "Cycle pivoted",
  learning:    "Cycle learning",
};

const SECTION_TITLES: Record<DefaultSectionKey, string> = {
  startingPoint:     "Where they started",
  centralChallenge:  "The real thing they were stuck on",
  decisivePivots:    "Decisive pivots",
  whatYouLearned:    "What they learned",
  whatYouBuilt:      "What they built",
  honestStruggles:   "Honest struggles",
  endingPoint:       "Where they are now",
  closingReflection: "",
};

export default async function PublicStoryPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const story = await loadPublicStoryBySlug(slug);
  if (!story) notFound();

  const readMin = estimateReadMinutes(story.content);
  const published = new Date(story.publishedAt).toLocaleDateString(undefined, {
    month: "long",
    day:   "numeric",
    year:  "numeric",
  });

  // Use the first sentence of the opening section as the H1.
  const firstSentence = extractFirstSentence(
    story.content.startingPoint ?? story.content.centralChallenge ?? story.ventureName,
  );

  return (
    <EditorialPage>
      {/* Hero — founder venture as mono stamp, first sentence as H1. */}
      <section className="relative border-b border-rule">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 320px at 25% 30%, rgba(255,90,60,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-[1320px] px-6 pb-16 pt-28 sm:px-10 lg:pb-24 lg:pt-32">
          <Link
            href="/stories"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-fg"
          >
            ← All stories
          </Link>
          <div className="mt-10 flex flex-wrap items-center gap-6 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            <span>{story.ventureName}</span>
            <span>{STATUS_LABEL[story.outcomeLabel]}</span>
            <span className="text-muted">{published}</span>
            <span className="text-muted">{readMin} min</span>
          </div>
          <h1 className="mt-9 max-w-[1100px] font-sans text-fg [font-size:clamp(40px,5.4vw,84px)] [font-weight:500] [line-height:1.02] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
            {firstSentence}
          </h1>
        </div>
      </section>

      {/* Body — two-column at lg+. */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1320px] px-6 py-20 sm:px-10 lg:py-28">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-16">
            <article>
              <div className="max-w-[720px]">
                {story.content.sectionOrder.map((key, i) => (
                  <StorySection
                    key={key}
                    sectionKey={key}
                    content={story.content}
                    firstSection={i === 0}
                  />
                ))}

                {story.content.customSections && story.content.customSections.length > 0 && (
                  <div className="mt-12 grid gap-12">
                    {story.content.customSections.map((cs, i) => (
                      <section key={i}>
                        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                          {cs.heading}
                        </h2>
                        <Prose body={cs.body} />
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </article>

            {/* Meta panel — sticky on lg+. */}
            <aside className="mt-16 lg:mt-0">
              <div className="lg:sticky lg:top-24">
                <MetaPanel
                  status={STATUS_LABEL[story.outcomeLabel]}
                  venture={story.ventureName}
                  published={published}
                  readMin={readMin}
                />
              </div>
            </aside>
          </div>
        </div>
      </section>

      <SatelliteClosing
        stamp="Read next"
        heading={
          <>
            Has this <em>resonated?</em>
          </>
        }
        body={
          <>
            NeuraLaunch is the system that wrote this — by interviewing the
            founder, committing to one direction, and walking with them through{" "}
            <em>every step.</em>
          </>
        }
        cta={{ href: "/discovery", label: "Begin Discovery" }}
      />
    </EditorialPage>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section renderer                                                          */
/* -------------------------------------------------------------------------- */

function StorySection({
  sectionKey,
  content,
  firstSection,
}: {
  sectionKey: DefaultSectionKey;
  content:    TransformationReport;
  firstSection: boolean;
}) {
  const title = SECTION_TITLES[sectionKey];

  switch (sectionKey) {
    case "decisivePivots": {
      const pivots = content.decisivePivots;
      if (!pivots || pivots.length === 0) return null;
      return (
        <section
          className={[
            "py-12",
            firstSection ? "" : "border-t border-rule",
          ].join(" ")}
        >
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {title}
          </h2>
          <ul className="mt-6 grid gap-9">
            {pivots.map((p, i) => (
              <li key={i} className="border-l-2 border-accent pl-6">
                <p className="font-sans text-[18px] font-medium leading-[1.35] text-fg">
                  {p.moment}
                </p>
                <p className="mt-3 text-[15px] leading-[1.65] text-fg-2">
                  {p.why}
                </p>
                <p className="mt-3 font-serif text-[15px] italic leading-[1.5] text-accent">
                  {p.change}
                </p>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "closingReflection": {
      return (
        <section
          className={[
            "py-12",
            firstSection ? "" : "border-t border-accent",
          ].join(" ")}
        >
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            In closing
          </h2>
          <div className="mt-5">
            <Prose body={content.closingReflection} />
          </div>
        </section>
      );
    }
    default: {
      const body = content[sectionKey];
      if (typeof body !== "string" || body.length === 0) return null;
      return (
        <section
          className={[
            "py-12",
            firstSection ? "" : "border-t border-rule",
          ].join(" ")}
        >
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {title}
          </h2>
          <Prose body={body} dropCap={firstSection} />
        </section>
      );
    }
  }
}

function Prose({ body, dropCap }: { body: string; dropCap?: boolean }) {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <div
      className={[
        "mt-5 grid gap-4 text-[16.5px] leading-[1.75] text-fg-2",
        dropCap
          ? "[&>p:first-child::first-letter]:float-left [&>p:first-child::first-letter]:mr-3 [&>p:first-child::first-letter]:mt-1.5 [&>p:first-child::first-letter]:font-serif [&>p:first-child::first-letter]:italic [&>p:first-child::first-letter]:text-[3.2em] [&>p:first-child::first-letter]:leading-[0.9] [&>p:first-child::first-letter]:text-accent"
          : "",
      ].filter(Boolean).join(" ")}
    >
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
        </p>
      ))}
    </div>
  );
}

function MetaPanel({
  status,
  venture,
  published,
  readMin,
}: {
  status: string;
  venture: string;
  published: string;
  readMin: number;
}) {
  return (
    <div className="border border-rule">
      <MetaRow k="Status" v={status} accent />
      <MetaRow k="Venture" v={venture} />
      <MetaRow k="Published" v={published} />
      <MetaRow k="Read time" v={`${readMin} min`} />
      <div className="border-t border-rule px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Anonymised by the author
        </p>
        <p className="mt-2 text-[13px] leading-[1.55] text-fg-2">
          Names, businesses, and specific numbers redacted by their choice.
        </p>
        <Link
          href="/stories"
          className="mt-5 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg transition-colors hover:text-accent"
        >
          Read the next story
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function MetaRow({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: boolean;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3 border-b border-rule px-5 py-4 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        {k}
      </span>
      <span
        className={`text-[13px] ${
          accent ? "text-accent" : "text-fg"
        }`}
      >
        {v}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function extractFirstSentence(body: string): string {
  const trimmed = body.trim();
  // Match through the first ., !, or ? followed by space/end.
  const m = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/);
  if (!m) return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
  return m[0];
}

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
