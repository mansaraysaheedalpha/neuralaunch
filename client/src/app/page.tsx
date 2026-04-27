import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  MessageSquare,
  Compass,
  ListChecks,
  Wrench,
  RefreshCcw,
  Mic,
  Send,
  Search,
  Package,
  Globe,
  Bell,
  Brain,
} from "lucide-react";
import type { ReactNode } from "react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import RevealOnScroll from "@/components/marketing/RevealOnScroll";
import HeroProductStack from "@/components/marketing/HeroProductStack";
import {
  ContinuationBriefMock,
  InterviewMock,
  RecommendationPreviewMock,
  RoadmapMock,
  TimelineStep,
  ToolsRowMock,
} from "@/components/marketing/HowItWorksTimeline";
import {
  PushbackLadder,
  SampleRecommendationCard,
} from "@/components/marketing/RecommendationAnatomy";
import ToolCard from "@/components/marketing/ToolCard";
import {
  CoachVisual,
  ComposerVisual,
  PackagerVisual,
  ResearchVisual,
  ValidationVisual,
} from "@/components/marketing/ToolCardVisuals";
import { PricingSection } from "@/components/marketing/PricingSection";
import { getPriceIds } from "@/lib/paddle/founding-members";

const HERO_SUBHEAD =
  "NeuraLaunch interviews your situation, commits to one clear recommendation, then partners with you through every task — until you've shipped, learned, or decided what comes next.";

export const metadata: Metadata = {
  title: "NeuraLaunch — From Lost to Launched",
  description: HERO_SUBHEAD,
  openGraph: {
    title: "NeuraLaunch — From Lost to Launched",
    description: HERO_SUBHEAD,
    type: "website",
    siteName: "NeuraLaunch",
  },
  twitter: {
    card: "summary_large_image",
    title: "NeuraLaunch — From Lost to Launched",
    description: HERO_SUBHEAD,
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-navy-950 text-slate-50 antialiased [scroll-behavior:smooth]">
      <MarketingHeader />
      <main id="main" className="pt-16">
        <Hero />
        <Problem />
        <HowItWorks />
        <OneRecommendation />
        <ExecutionTools />
        <Differentiation />
        <ItStaysWithYou />
        <Pricing />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </div>
  );
}

/* ============================================================
   SECTION 1 — HERO
   ============================================================ */
function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-b from-navy-950 via-navy-900 to-navy-800"
    >
      {/* subtle radial glow — purely decorative, css-only */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[600px] max-w-5xl bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.15),_transparent_60%)]"
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-4 pb-24 pt-20 sm:px-6 sm:pb-28 sm:pt-28 lg:min-h-[95vh] lg:grid-cols-12 lg:gap-12 lg:px-8 lg:pb-24 lg:pt-24">
        <div className="lg:col-span-5">
          <RevealOnScroll>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-navy-800/80 px-3.5 py-1.5 text-xs font-medium text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              From lost to launched. For everyone.
            </p>
          </RevealOnScroll>

          <RevealOnScroll delayMs={80}>
            <h1
              id="hero-heading"
              className="max-w-[620px] text-balance text-display text-white"
            >
              You know something needs to change.{" "}
              <span className="text-gold">
                We&rsquo;ll tell you what — and walk it with you.
              </span>
            </h1>
          </RevealOnScroll>

          <RevealOnScroll delayMs={160}>
            <p className="mt-7 max-w-[540px] text-base leading-relaxed text-slate-300 sm:text-lg">
              {HERO_SUBHEAD}
            </p>
          </RevealOnScroll>

          <RevealOnScroll delayMs={240}>
            <div className="mt-10 flex">
              <Link
                href="/discovery"
                className="group inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-primary/20 ring-1 ring-transparent transition-all hover:bg-blue-700 hover:shadow-xl hover:shadow-primary/30 hover:ring-gold/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
              >
                Start Your Discovery
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-300">
              Free to start. No credit card required.
            </p>
          </RevealOnScroll>
        </div>

        <div className="mt-12 lg:col-span-7 lg:mt-0 lg:pl-4">
          <HeroProductStack />
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 2 — THE PROBLEM
   ============================================================ */
const PROBLEM_MOMENTS: Array<{ title: string; body: string }> = [
  {
    title: "The graduate",
    body: "Studied for years. Applied everywhere. Got nowhere. Has skills the world needs and no clear path to use them.",
  },
  {
    title: "The stuck founder",
    body: "Started something. Got some traction. Hit a wall. Cannot tell if the problem is the product, the market, the pricing, or something deeper.",
  },
  {
    title: "The shop owner",
    body: "Has real customers and real revenue. Knows growth is possible. Cannot see the next move from where they're standing.",
  },
  {
    title: "The aspiring builder",
    body: "Has a real idea. Maybe even early users. No idea how to take the next step without burning months on the wrong thing.",
  },
  {
    title: "The professional with a side project",
    body: "Has skills, has resources, maybe even a small team. Drowning in options. Cannot find the one direction that actually fits.",
  },
];

function Problem() {
  return (
    <section
      aria-labelledby="problem-heading"
      className="border-b border-slate-800 bg-navy-950"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <RevealOnScroll>
            <h2
              id="problem-heading"
              className="text-heading text-white"
            >
              You are not the first person to feel stuck.
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={80}>
            <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
              The world has consultants — expensive, generic, built for
              companies that already have money. The world has AI tools — they
              give you five options when you need one answer, then leave you
              alone the moment the answer is delivered.
              <span className="mt-3 block font-medium text-slate-200">
                Nothing has been built for the moments in between. Until now.
              </span>
            </p>
          </RevealOnScroll>
        </div>

        <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEM_MOMENTS.map((moment, i) => (
            <RevealOnScroll key={moment.title} delayMs={i * 60}>
              <article className="h-full rounded-lg border border-slate-800 bg-navy-800/40 p-6 transition-colors hover:border-slate-700 hover:bg-navy-800/70">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gold">
                  {moment.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  {moment.body}
                </p>
              </article>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 3 — HOW IT WORKS
   ============================================================ */
type Step = Omit<
  React.ComponentProps<typeof TimelineStep>,
  "index" | "number"
>;

const STEP_ICON_CLASS = "h-4 w-4";

const STEPS: Step[] = [
  {
    icon: <MessageSquare className={STEP_ICON_CLASS} aria-hidden="true" />,
    eyebrow: "Step 1 · Discovery",
    title: "Be heard.",
    body: "A focused interview that builds a real picture of who you are, what you want, what you have, and what you've already tried. Five to fifteen questions, capped at fifteen.",
    side: "right",
    color: "primary",
    visual: <InterviewMock />,
  },
  {
    icon: <Compass className={STEP_ICON_CLASS} aria-hidden="true" />,
    eyebrow: "Step 2 · Commitment",
    title: "One recommendation.",
    body: "Not a menu. One direction — for your specific situation — with the reasoning, risks, and what would make it wrong, all on the table. Push back if you disagree.",
    side: "left",
    color: "primary-to-gold",
    visual: <RecommendationPreviewMock />,
  },
  {
    icon: <ListChecks className={STEP_ICON_CLASS} aria-hidden="true" />,
    eyebrow: "Step 3 · Roadmap",
    title: "A real roadmap.",
    body: "Phased, sequenced, sized to your hours. Up to five phases, up to five tasks per phase. Every task has a reason, a time estimate against your weekly hours, and a concrete success criterion.",
    side: "right",
    color: "gold",
    visual: <RoadmapMock />,
  },
  {
    icon: <Wrench className={STEP_ICON_CLASS} aria-hidden="true" />,
    eyebrow: "Step 4 · Execution",
    title: "Execute with tools.",
    body: "Conversation Coach for the calls. Outreach Composer for the messages. Research Tool for the questions. Service Packager for the offer. Validation Page for the demand. Built for the work that decides whether you win.",
    side: "left",
    color: "gold-to-success",
    visual: <ToolsRowMock />,
  },
  {
    icon: <RefreshCcw className={STEP_ICON_CLASS} aria-hidden="true" />,
    eyebrow: "Step 5 · Continuation",
    title: "Learn and continue.",
    body: "When the cycle ends, NeuraLaunch produces a five-section brief: what happened, what got missed, what the evidence says, the forks ahead, and the parking lot. The next cycle starts smarter than the last.",
    side: "right",
    color: "success",
    visual: <ContinuationBriefMock />,
  },
];

function HowItWorks() {
  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="border-b border-slate-800 bg-navy-900"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <RevealOnScroll>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              How it works
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={60}>
            <h2
              id="how-it-works-heading"
              className="mt-3 text-balance text-heading text-white"
            >
              One arc. From first question to first outcome.
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={120}>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 lg:text-lg">
              Five moments. Each one connects to the next. The work compounds
              because the system stays.
            </p>
          </RevealOnScroll>
        </div>

        <div className="relative mx-auto mt-16 max-w-6xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-0 h-full w-px bg-gradient-to-b from-primary via-gold to-success md:left-6 lg:left-1/2 lg:-translate-x-1/2"
          />
          <ol role="list" className="space-y-16 lg:space-y-24">
            {STEPS.map((step, i) => (
              <TimelineStep
                key={step.title}
                index={i}
                number={i + 1}
                {...step}
              />
            ))}
          </ol>
          <p className="mt-12 text-center text-sm italic text-slate-400 lg:mt-16">
            From the first question to the first outcome &mdash; and into the
            next.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 4 — ONE RECOMMENDATION. NOT FIVE.
   ============================================================ */
function OneRecommendation() {
  return (
    <section
      aria-labelledby="one-rec-heading"
      className="border-b border-slate-800 bg-navy-950"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <RevealOnScroll>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
              The principle
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={60}>
            <h2
              id="one-rec-heading"
              className="mt-3 text-balance text-heading text-white"
            >
              One recommendation.{" "}
              <span className="text-gold">Not five.</span>
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={120}>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-slate-300 lg:text-lg">
              Every other AI tool is afraid to commit. It gives you options.
              It hedges. NeuraLaunch listens to your full situation, then
              commits to one direction &mdash; with the reasoning, the
              risks, and the assumptions laid bare. Disagree? Argue with it.{" "}
              <span className="text-white">This is what it looks like.</span>
            </p>
          </RevealOnScroll>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <SampleRecommendationCard />
          </div>
          <div className="lg:col-span-5">
            <PushbackLadder />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 5 — THE EXECUTION TOOLS
   ============================================================ */
type ToolEntry = {
  icon: ReactNode;
  name: string;
  tagline: string;
  body: string;
  accent: "blue" | "gold";
  visual: ReactNode;
  spanClass: string;
};

const TOOL_ICON_CLASS = "h-5 w-5";

const TOOLS: ToolEntry[] = [
  {
    icon: <Mic className={TOOL_ICON_CLASS} aria-hidden="true" />,
    name: "Conversation Coach",
    tagline: "Rehearse the pitch before you walk in.",
    body: "Tell it who you're talking to and what you're afraid of. It builds the opening, the asks, the objections — then role-plays the other side in character.",
    accent: "blue",
    visual: <CoachVisual />,
    spanClass: "lg:col-span-2",
  },
  {
    icon: <Send className={TOOL_ICON_CLASS} aria-hidden="true" />,
    name: "Outreach Composer",
    tagline: "Your messages, written and ready to send.",
    body: "Single message, batched variations, or a Day 1 / Day 5 / Day 14 sequence across WhatsApp, email, and LinkedIn — each with a short note on why it works.",
    accent: "blue",
    visual: <ComposerVisual />,
    spanClass: "lg:col-span-2",
  },
  {
    icon: <Search className={TOOL_ICON_CLASS} aria-hidden="true" />,
    name: "Research Tool",
    tagline: "Find the people, the competitors, the answers.",
    body: "Ask in plain language. Get back structured findings — businesses, competitors, regulations — with source URLs and a verified / likely / unverified label.",
    accent: "blue",
    visual: <ResearchVisual />,
    spanClass: "lg:col-span-2",
  },
  {
    icon: <Package className={TOOL_ICON_CLASS} aria-hidden="true" />,
    name: "Service Packager",
    tagline: "Turn what you do into tiers people can buy.",
    body: "Builds three priced tiers from your situation — Starter, Pro, Premium — with the features, the price, and the reasoning behind each one.",
    accent: "gold",
    visual: <PackagerVisual />,
    spanClass: "lg:col-span-3",
  },
  {
    icon: <Globe className={TOOL_ICON_CLASS} aria-hidden="true" />,
    name: "Validation Page",
    tagline: "A live page to test demand before you build.",
    body: "Hosts a slug-routed landing page with a survey and analytics, so you learn whether anyone actually wants this — before you write a line of code.",
    accent: "gold",
    visual: <ValidationVisual />,
    spanClass: "lg:col-span-3",
  },
];

function ExecutionTools() {
  return (
    <section
      aria-labelledby="tools-heading"
      className="border-b border-slate-800 bg-navy-900"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <RevealOnScroll>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              The toolkit
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={60}>
            <h2 id="tools-heading" className="mt-3 text-heading text-white">
              Five tools, built for the work that decides whether you win.
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={120}>
            <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
              The first cold message. The pricing call. The conversation with
              the partner you&rsquo;ve been avoiding. These moments decide
              outcomes. We built the tools for them.
            </p>
          </RevealOnScroll>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-6">
          {TOOLS.map((tool, i) => (
            <ToolCard
              key={tool.name}
              index={i}
              icon={tool.icon}
              name={tool.name}
              tagline={tool.tagline}
              body={tool.body}
              accent={tool.accent}
              visual={tool.visual}
              className={tool.spanClass}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 6 — WHAT MAKES THIS DIFFERENT
   ============================================================ */
const COMPARISONS: Array<{ them: string; us: string }> = [
  {
    them: "Idea validators score your idea and send you away.",
    us: "NeuraLaunch interviews your situation — not your idea — and stays with you through every task that follows.",
  },
  {
    them: "Report generators produce a document you read once and close.",
    us: "NeuraLaunch produces a roadmap you live inside for weeks, with tools and check-ins built into every step.",
  },
  {
    them: "Advice tools give you options.",
    us: "NeuraLaunch gives you one answer, defends it, and changes its mind only if you argue well enough.",
  },
  {
    them: "Chatbots forget everything when you close the tab.",
    us: "NeuraLaunch remembers every check-in, every block, every adjacent idea — and uses them to tell you what you learned.",
  },
  {
    them: "Consultants cost thousands, live in one meeting, and disappear.",
    us: "NeuraLaunch is there every time you open the tab, at a fraction of the price, with perfect recall.",
  },
];

function Differentiation() {
  return (
    <section
      aria-labelledby="diff-heading"
      className="border-b border-slate-800 bg-navy-950"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <RevealOnScroll>
            <h2
              id="diff-heading"
              className="text-heading text-white"
            >
              The category had a gap. We filled it.
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={80}>
            <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
              An AI that stays with a founder across the full execution cycle —
              from first question to first outcome — and interprets what
              happened so the next cycle is smarter than the last.
            </p>
          </RevealOnScroll>
        </div>

        <div className="mx-auto mt-14 max-w-5xl space-y-3">
          {COMPARISONS.map((row, i) => (
            <RevealOnScroll key={row.them} delayMs={i * 60}>
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800 md:grid-cols-2">
                <div className="bg-navy-900 p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    The tools that exist
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300 line-through decoration-slate-700 decoration-1 underline-offset-4">
                    {row.them}
                  </p>
                </div>
                <div className="bg-navy-800 p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    NeuraLaunch
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">
                    {row.us}
                  </p>
                </div>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 7 — IT STAYS WITH YOU
   ============================================================ */
function ItStaysWithYou() {
  return (
    <section
      aria-labelledby="stays-heading"
      className="border-b border-slate-800 bg-navy-900"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <RevealOnScroll>
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                It stays with you
              </p>
              <h2
                id="stays-heading"
                className="mt-4 text-heading text-white"
              >
                A partner. Not a tool you check.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-slate-300 sm:text-lg">
                NeuraLaunch doesn&rsquo;t disappear after handing you a plan.
                It checks in when you&rsquo;ve been stuck on a task too long.
                It notices when the pattern across many tasks suggests the
                direction itself is wrong — and offers to recalibrate. It
                remembers every conversation. And when the cycle ends, it
                tells you what happened, what it got wrong, and what comes
                next.
              </p>
            </div>
          </RevealOnScroll>

          <RevealOnScroll delayMs={120}>
            <div className="space-y-3">
              <Beat
                icon={Bell}
                title="It checks in"
                body="When you've been working on a task longer than its time estimate — or you've gone quiet for too long — it surfaces the question."
              />
              <Beat
                icon={Brain}
                title="It remembers"
                body="Every check-in, every blocked task, every parked idea is held in context. Nothing has to be re-explained."
              />
              <Beat
                icon={RefreshCcw}
                title="It recalibrates"
                body="When several check-ins point structurally the same way, it offers to revisit the recommendation — without you having to ask."
              />
              <Beat
                icon={Compass}
                title="It tells you what's next"
                body="At the end of a cycle: a five-section brief on what happened, what was wrong, and two to four concrete forks to choose from."
              />
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}

function Beat({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Bell;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-slate-800 bg-navy-950 p-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success/10 ring-1 ring-inset ring-success/30">
        <Icon className="h-4 w-4 text-success" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{body}</p>
      </div>
    </div>
  );
}

/* ============================================================
   SECTION 8 — PRICING
   ============================================================ */
async function Pricing() {
  // Fetch per-tier price ids at request time. The hidden founding rate
  // is returned only while slots remain — switching to the standard
  // monthly price the moment the 50-user ceiling is hit.
  const [execute, compound] = await Promise.all([
    getPriceIds('execute'),
    getPriceIds('compound'),
  ]);

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="border-b border-slate-800 bg-navy-950 scroll-mt-20"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <RevealOnScroll>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Pricing
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={60}>
            <h2
              id="pricing-heading"
              className="mt-3 text-heading text-white"
            >
              Each tier unlocks the next layer of the journey.
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={120}>
            <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
              The free tier earns trust. The paid tiers deliver transformation.
            </p>
          </RevealOnScroll>
        </div>

        <div className="mt-14">
          <PricingSection execute={execute} compound={compound} />
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 9 — FINAL CTA
   ============================================================ */
function FinalCTA() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="bg-gradient-to-b from-navy-900 to-navy-950"
    >
      <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <RevealOnScroll>
          <div className="text-center">
            <h2
              id="final-cta-heading"
              className="text-balance text-heading text-white"
            >
              From lost to launched.{" "}
              <span className="text-gold">For everyone.</span>{" "}
              One step at a time.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Answer a few honest questions. Get one clear direction —
              built specifically for your situation. Then have a partner
              with you through the work that follows.
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
