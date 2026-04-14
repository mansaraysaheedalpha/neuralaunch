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
    <div className="min-h-screen bg-[#070F1C] text-[#F7F8FA] antialiased">
      <MarketingHeader />
      <main id="main" className="pt-16">
        <Hero />
        <Story />
        <Beliefs />
        <Team />
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
      className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-b from-[#070F1C] via-[#0A1628] to-[#0D1E38]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[500px] max-w-5xl bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.12),_transparent_60%)]"
      />
      <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-20 sm:px-6 sm:pb-28 sm:pt-28 lg:px-8 lg:pb-36 lg:pt-32">
        <div className="text-center">
          <RevealOnScroll>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-[#0D1E38]/80 px-3.5 py-1.5 text-xs font-medium text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D4A843]" />
              About NeuraLaunch
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={80}>
            <h1
              id="about-hero"
              className="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl"
            >
              We&rsquo;re building the guide that{" "}
              <span className="text-[#D4A843]">
                should have always existed.
              </span>
            </h1>
          </RevealOnScroll>
          <RevealOnScroll delayMs={160}>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
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
      className="border-b border-slate-800 bg-[#070F1C]"
    >
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <RevealOnScroll>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#2563EB]">
            Why we built it
          </p>
          <h2
            id="story-heading"
            className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
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
            <div className="border-l-2 border-[#D4A843] pl-6 py-2">
              <p className="text-lg font-medium text-white sm:text-xl">
                So we built it. Two engineers and an operator, working from
                Freetown, Sierra Leone, with the conviction that the right
                guide at the right moment can change a life.
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
    border: "ring-[#2563EB]/30",
    bg: "bg-[#2563EB]/10",
    text: "text-[#2563EB]",
  },
  gold: {
    border: "ring-[#D4A843]/30",
    bg: "bg-[#D4A843]/10",
    text: "text-[#D4A843]",
  },
  emerald: {
    border: "ring-[#10B981]/30",
    bg: "bg-[#10B981]/10",
    text: "text-[#10B981]",
  },
} as const;

function Beliefs() {
  return (
    <section
      aria-labelledby="beliefs-heading"
      className="border-b border-slate-800 bg-[#0A1628]"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <RevealOnScroll>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#2563EB]">
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
                <article className="h-full rounded-xl border border-slate-800 bg-[#070F1C] p-7 transition-colors hover:border-slate-700">
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
                  <p className="mt-3 text-base leading-relaxed text-slate-400">
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
   THE TEAM
   ============================================================ */
const TEAM: Array<{
  name: string;
  role: string;
  blurb: string;
  initials: string;
  accent: "blue" | "gold" | "emerald";
}> = [
  {
    name: "Alpha Saheed Mansaray",
    role: "Founder & CEO",
    blurb:
      "The believer. Spent decades watching capable people get stuck — and refused to accept that the right guidance had to be a privilege. Set the conviction the company is built on.",
    initials: "AS",
    accent: "gold",
  },
  {
    name: "Saheed Alpha Mansaray",
    role: "Co-Founder & Chief Engineer",
    blurb:
      "The builder. Designs and engineers the system end-to-end — from the discovery interview to the continuation brief. Holds the technical bar at the standard of a senior team at a world-class company.",
    initials: "SM",
    accent: "blue",
  },
  {
    name: "John Bismark Sesay",
    role: "Chief Operating Officer",
    blurb:
      "The operator. Translates the conviction and the engineering into a company that runs. Owns the discipline and the everyday rhythm that turns ambition into delivery.",
    initials: "JS",
    accent: "emerald",
  },
];

function Team() {
  return (
    <section
      aria-labelledby="team-heading"
      className="border-b border-slate-800 bg-[#070F1C]"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <RevealOnScroll>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#2563EB]">
              The team
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={60}>
            <h2
              id="team-heading"
              className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
            >
              Three people. One conviction. Built with discipline.
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={120}>
            <p className="mt-5 text-base leading-relaxed text-slate-400 sm:text-lg">
              Not a corporation. Not a VC-backed team of fifty. A small group
              that decided the gap between lost and launched should not be
              decided by what someone already has.
            </p>
          </RevealOnScroll>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
          {TEAM.map((member, i) => {
            const accent = ACCENT_STYLES[member.accent];
            return (
              <RevealOnScroll key={member.name} delayMs={i * 100}>
                <article className="h-full rounded-xl border border-slate-800 bg-[#0A1628] p-7 transition-colors hover:border-slate-700">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-inset font-semibold text-sm tracking-wider ${accent.bg} ${accent.border} ${accent.text}`}
                      aria-hidden="true"
                    >
                      {member.initials}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        {member.name}
                      </h3>
                      <p className={`text-sm font-medium ${accent.text}`}>
                        {member.role}
                      </p>
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-slate-400">
                    {member.blurb}
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
      className="border-b border-slate-800 bg-[#0A1628]"
    >
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="rounded-2xl border border-slate-800 bg-[#070F1C] p-8 sm:p-12 lg:p-16">
          <RevealOnScroll>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#D4A843]">
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
    <div className="flex items-center gap-4 bg-[#070F1C] p-6">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${a.bg} ${a.border}`}
      >
        <Icon className={`h-4 w-4 ${a.text}`} aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
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
      className="bg-gradient-to-b from-[#0A1628] to-[#070F1C]"
    >
      <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <RevealOnScroll>
          <div className="text-center">
            <h2
              id="about-cta-heading"
              className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
            >
              The best way to understand what we&rsquo;re building is to{" "}
              <span className="text-[#D4A843]">use it.</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              One honest interview. One clear direction. A partner with you
              through the work that follows.
            </p>
            <div className="mt-10 flex justify-center">
              <Link
                href="/discovery"
                className="group inline-flex items-center gap-2 rounded-md bg-[#2563EB] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-[#2563EB]/20 transition-all hover:bg-[#1D4ED8] hover:shadow-xl hover:shadow-[#2563EB]/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070F1C]"
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
