// src/app/stories/page.tsx
//
// Public archive index — a vertical list of every published
// transformation story. No auth, no tier gate, no filters in v1.
// Newest-first chronological. Reuses the StoryCard component
// from the marketing strip in single-column mode.
//
// When the archive is empty, renders an honest "no stories yet"
// state with a CTA back to /discovery — better than a blank page.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { StoryCard } from "@/components/marketing/stories/StoryCard";
import { loadPublicStorySummaries } from "@/lib/transformation/public";

const ARCHIVE_TAKE = 50;

export const metadata: Metadata = {
  title: "Real founders. Real journeys. — NeuraLaunch",
  description:
    "Every story below is from a real founder who completed a venture on NeuraLaunch. Names, businesses, and specifics are redacted by their author.",
  openGraph: {
    title:       "Real founders. Real journeys. — NeuraLaunch",
    description: "Anonymised transformation reports from founders who took the path end to end.",
    type:        "website",
    siteName:    "NeuraLaunch",
  },
};

export default async function StoriesIndexPage() {
  const stories = await loadPublicStorySummaries({ take: ARCHIVE_TAKE });

  return (
    <div className="min-h-screen bg-navy-950 text-slate-50 antialiased">
      <MarketingHeader />
      <main id="main" className="pt-16">
        <section
          aria-labelledby="stories-index-heading"
          className="border-b border-slate-800 bg-navy-950"
        >
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-slate-200"
            >
              <ArrowLeft className="size-4" />
              Back to home
            </Link>

            <div className="mt-8">
              <p className="text-sm font-semibold uppercase tracking-widest text-gold">
                What happens when someone takes the path
              </p>
              <h1
                id="stories-index-heading"
                className="mt-3 text-balance text-heading text-white"
              >
                Real founders. Real journeys.
              </h1>
              <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
                Every story below is from a real founder who completed a venture on NeuraLaunch.
                Names, businesses, and specifics are redacted by their author.
              </p>
            </div>

            {stories.length === 0 ? (
              <div className="mt-16 rounded-2xl border border-slate-800 bg-navy-900/40 px-8 py-12 text-center">
                <p className="text-base text-slate-300">
                  No published stories yet — this archive grows as founders complete and choose to share their ventures.
                </p>
                <Link
                  href="/discovery"
                  className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Start your own discovery
                </Link>
              </div>
            ) : (
              <div className="mt-12 flex flex-col gap-5">
                {stories.map((story, i) => (
                  <div key={story.publicSlug} className="flex w-full">
                    <StoryCard
                      story={story}
                      variant={i % 2 === 0 ? "standard" : "rotated"}
                      size="default"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
