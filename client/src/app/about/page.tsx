import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Compass,
  Heart,
  MessageCircle,
  Eye,
  Layers,
  Hammer,
} from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import RevealOnScroll from "@/components/marketing/RevealOnScroll";

export const metadata: Metadata = {
  title: "About — NeuraLaunch",
  description:
    "Why we built NeuraLaunch. Who's behind it. What we believe about the gap between lost and launched.",
  openGraph: {
    title: "About — NeuraLaunch",
    description:
      "Why we built NeuraLaunch. Who's behind it. What we believe about the gap between lost and launched.",
    type: "website",
    siteName: "NeuraLaunch",
  },
  twitter: {
    card: "summary_large_image",
    title: "About — NeuraLaunch",
    description:
      "Why we built NeuraLaunch. Who's behind it. What we believe.",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-navy-950 text-slate-50 antialiased">
      <MarketingHeader />
      <main id="main" className="pt-16">
        <Hero />
        <Story />
        <Beliefs />
        <Company />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </div>
  );
}

/* ============================================================
   HERO
   ============================================================ */
function Hero() {
  return (
    <section
      aria-labelledby="about-hero"
      className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[500px] max-w-5xl bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.12),_transparent_60%)]"
      />
      <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-28 lg:px-8 lg:pb-36 lg:pt-32">
        <div className="text-center">
          <RevealOnScroll>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-navy-800/80 px-3.5 py-1.5 text-xs font-medium text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              Our conviction
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={80}>
            <h1
              id="about-hero"
              className="mx-auto max-w-3xl text-balance text-[clamp(2.25rem,4vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-white"
            >
              We&rsquo;re building the guide that{" "}
              <span className="text-gold">
                should have always existed.
              </span>
            </h1>
          </RevealOnScroll>
          <RevealOnScroll delayMs={160}>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              The gap between <em className="text-slate-200 not-italic">where someone is</em>{" "}
              and <em className="text-slate-200 not-italic">where they could be</em>{" "}
              should not be decided by what they already have. Not their money,
              not their connections, not their geography. NeuraLaunch is our
              answer to that belief.
            </p>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   THE STORY
   ============================================================ */
function Story() {
  return (
    <section
      aria-labelledby="story-heading"
      className="border-b border-slate-800 bg-navy-950"
    >
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <RevealOnScroll>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Why we built it
          </p>
          <h2
            id="story-heading"
            className="mt-3 text-balance text-[clamp(1.875rem,3.5vw,3rem)] font-bold leading-[1.15] tracking-tight text-white"
          >
            The world has consultants. The world has AI tools. Neither was the
            thing people actually needed.
          </h2>
        </RevealOnScroll>

        <div className="mt-12 space-y-6 text-base leading-relaxed text-slate-300 sm:text-lg">
          <RevealOnScroll delayMs={80}>
            <p>
              Every day, millions of people wake up stuck. The graduate who
              applied everywhere and got nowhere. The shop owner whose growth
              stalled and who can&rsquo;t see why. The founder with early
              traction who hit a wall. The professional drowning in options.
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={140}>
            <p>
              What they all share isn&rsquo;t failure. It&rsquo;s the absence
              of the right guide at the right moment. Consultants exist — but
              they&rsquo;re expensive, generic, and built for companies that
              already have money. AI tools exist — but they hand you five
              options when you needed one answer, and they leave you alone the
              moment the answer is delivered.
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={200}>
            <p>
              Nothing had been built for the moments in between. Nothing
              listened first, committed to one direction, and then stayed
              through the work of making that direction real.
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={260}>
            <div className="mt-4 overflow-hidden rounded-2xl border border-l-[3px] border-gold/30 border-l-gold bg-gradient-to-br from-navy-800 to-navy-900 p-7 shadow-xl shadow-navy-950/40 lg:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                The founding moment
              </p>
              <p className="mt-3 text-lg font-semibold leading-relaxed text-white sm:text-xl">
                &ldquo;So we built it. Two engineers and an operator, working
                from Freetown, Sierra Leone, with the conviction that the
                right guide at the right moment can change a life.&rdquo;
              </p>
              <p className="mt-4 text-sm text-slate-400">
                &mdash; The founding team
              </p>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   WHAT WE BELIEVE
   ============================================================ */
const BELIEFS: Array<{
  icon: typeof Compass;
  title: string;
  body: string;
  accent: "blue" | "gold" | "emerald";
}> = [
  {
    icon: Compass,
    title: "One answer is more useful than five options.",
    body: "When someone is lost, they don't need more options to evaluate. They need a direction they can trust — and someone willing to defend it, or change their mind when the case is made.",
    accent: "gold",
  },
  {
    icon: MessageCircle,
    title: "The work decides the outcome — not the strategy.",
    body: "The moments that decide whether a founder wins are not the moments code gets written. They're the first cold message, the pricing call, the conversation with the partner you've been avoiding. We built tools for that work.",
    accent: "blue",
  },
  {
    icon: Eye,
    title: "Listen before you recommend.",
    body: "Quality of the answer is bounded by quality of the understanding. NeuraLaunch interviews the situation, notices when the surface answer isn't the real one, and earns the right to recommend by asking first.",
    accent: "blue",
  },
  {
    icon: Heart,
    title: "Stay through the cycle.",
    body: "A plan you receive once is a document you'll close in a week. A partner that stays — through the blocks, the wins, the recalibrations — is the difference between a roadmap on paper and a roadmap that ships.",
    accent: "emerald",
  },
];

const ACCENT_STYLES = {
  blue: {
    border: "ring-primary/30",
    bg: "bg-primary/10",
    text: "text-primary",
  },
  gold: {
    border: "ring-gold/30",
    bg: "bg-gold/10",
    text: "text-gold",
  },
  emerald: {
    border: "ring-success/30",
    bg: "bg-success/10",
    text: "text-success",
  },
} as const;

function Beliefs() {
  return (
    <section
      aria-labelledby="beliefs-heading"
      className="border-b border-slate-800 bg-navy-900"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <RevealOnScroll>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              What we believe
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={60}>
            <h2
              id="beliefs-heading"
              className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
            >
              Four convictions shape every decision we make.
            </h2>
          </RevealOnScroll>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
          {BELIEFS.map((belief, i) => {
            const Icon = belief.icon;
            const accent = ACCENT_STYLES[belief.accent];
            return (
              <RevealOnScroll key={belief.title} delayMs={i * 80}>
                <article className="h-full rounded-xl border border-slate-800 bg-navy-950 p-7 transition-colors hover:border-slate-700">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-lg ring-1 ring-inset ${accent.bg} ${accent.border}`}
                  >
                    <Icon
                      className={`h-5 w-5 ${accent.text}`}
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-white">
                    {belief.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-slate-300">
                    {belief.body}
                  </p>
                </article>
              </RevealOnScroll>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   THE COMPANY
   ============================================================ */
function Company() {
  return (
    <section
      aria-labelledby="company-heading"
      className="border-b border-slate-800 bg-navy-900"
    >
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="rounded-2xl border border-slate-800 bg-navy-950 p-8 sm:p-12 lg:p-16">
          <RevealOnScroll>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              The company
            </p>
            <h2
              id="company-heading"
              className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl"
            >
              A product of Tabempa Engineering Limited.
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={80}>
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Tabempa Engineering Limited is the parent company. Headquartered
              in Freetown, Sierra Leone — a vantage point that informs how we
              think about access, constraint, and the difference a single
              clear direction can make for someone whose options are
              genuinely limited.
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={140}>
            <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 sm:grid-cols-3">
              <Stat
                icon={Layers}
                label="Founded"
                value="2026"
                accent="blue"
              />
              <Stat
                icon={Hammer}
                label="Built from"
                value="Freetown, SL"
                accent="gold"
              />
              <Stat
                icon={Heart}
                label="Built for"
                value="Everyone stuck"
                accent="emerald"
              />
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  accent: "blue" | "gold" | "emerald";
}) {
  const a = ACCENT_STYLES[accent];
  return (
    <div className="flex items-center gap-4 bg-navy-950 p-6">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${a.bg} ${a.border}`}
      >
        <Icon className={`h-4 w-4 ${a.text}`} aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          {label}
        </p>
        <p className="mt-1 text-base font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

/* ============================================================
   FINAL CTA
   ============================================================ */
function FinalCTA() {
  return (
    <section
      aria-labelledby="about-cta-heading"
      className="bg-gradient-to-b from-navy-900 to-navy-950"
    >
      <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <RevealOnScroll>
          <div className="text-center">
            <h2
              id="about-cta-heading"
              className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
            >
              The best way to understand what we&rsquo;re building is to{" "}
              <span className="text-gold">use it.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              One honest interview. One clear direction. A partner with you
              through the work that follows.
            </p>
            <div className="mt-10 flex justify-center">
              <Link
                href="/discovery"
                className="group inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-blue-700 hover:shadow-xl hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
              >
                Start Your Discovery
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
