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
  Bell,
  Brain,
  Check,
} from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import RevealOnScroll from "@/components/marketing/RevealOnScroll";

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

      <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-20 sm:px-6 sm:pb-28 sm:pt-28 lg:px-8 lg:pb-36 lg:pt-36">
        <div className="text-center">
          <RevealOnScroll>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-navy-800/80 px-3.5 py-1.5 text-xs font-medium text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              From lost to launched. For everyone.
            </p>
          </RevealOnScroll>

          <RevealOnScroll delayMs={80}>
            <h1
              id="hero-heading"
              className="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl"
            >
              You know something needs to change.{" "}
              <span className="text-gold">
                We&rsquo;ll tell you what — and walk it with you.
              </span>
            </h1>
          </RevealOnScroll>

          <RevealOnScroll delayMs={160}>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              {HERO_SUBHEAD}
            </p>
          </RevealOnScroll>

          <RevealOnScroll delayMs={240}>
            <div className="mt-10 flex justify-center">
              <Link
                href="/discovery"
                className="group inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-blue-700 hover:shadow-xl hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
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
              className="text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
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
const STEPS: Array<{
  icon: typeof MessageSquare;
  title: string;
  body: string;
}> = [
  {
    icon: MessageSquare,
    title: "Be heard",
    body: "A focused interview that builds a real picture of who you are, what you want, what you have, and what you've already tried.",
  },
  {
    icon: Compass,
    title: "One recommendation",
    body: "Not a menu. One direction — with the reasoning, the risks, and the assumptions laid bare. Push back if you disagree.",
  },
  {
    icon: ListChecks,
    title: "A real roadmap",
    body: "Phased, sequenced, sized to the hours you actually have. Every task with a reason and a way to know it's done.",
  },
  {
    icon: Wrench,
    title: "Execute with tools",
    body: "Conversation Coach, Outreach Composer, Research Tool — built for the work that actually decides whether you win.",
  },
  {
    icon: RefreshCcw,
    title: "Learn and continue",
    body: "When the cycle ends, NeuraLaunch tells you what happened, what it got wrong, and what comes next.",
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
              className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
            >
              One arc. From first question to first outcome.
            </h2>
          </RevealOnScroll>
        </div>

        <ol className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <RevealOnScroll key={step.title} delayMs={i * 80}>
                <li className="relative h-full rounded-lg border border-slate-800 bg-navy-950 p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-navy-800 text-xs font-semibold text-slate-300">
                      {i + 1}
                    </span>
                    <Icon
                      className="h-5 w-5 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {step.body}
                  </p>
                </li>
              </RevealOnScroll>
            );
          })}
        </ol>
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
        <div className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-navy-800 to-navy-900 p-8 sm:p-12 lg:p-16">
            <RevealOnScroll>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">
                The principle
              </p>
            </RevealOnScroll>
            <RevealOnScroll delayMs={80}>
              <h2
                id="one-rec-heading"
                className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl"
              >
                One recommendation.{" "}
                <span className="text-gold">Not five.</span>
              </h2>
            </RevealOnScroll>
            <RevealOnScroll delayMs={160}>
              <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-14">
                <div>
                  <p className="text-base leading-relaxed text-slate-300 sm:text-lg">
                    Every other AI tool is afraid to commit. It gives you
                    options. It hedges. It says &ldquo;here are some strategies
                    you could consider.&rdquo;
                  </p>
                  <p className="mt-4 text-base leading-relaxed text-slate-300 sm:text-lg">
                    NeuraLaunch does not do that. After listening to your full
                    situation, it commits to{" "}
                    <span className="font-medium text-white">
                      one direction
                    </span>{" "}
                    — the right one for you specifically — with the reasoning,
                    the risks, and the assumptions laid out plainly.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-navy-950/60 p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                    If you disagree
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-slate-300">
                    You can push back. Up to seven rounds of real argument. It
                    will{" "}
                    <span className="text-white">defend where it should</span>,{" "}
                    <span className="text-white">
                      refine where the point is valid
                    </span>
                    , and{" "}
                    <span className="text-white">
                      replace the recommendation entirely
                    </span>{" "}
                    if you and the evidence together prove it wrong.
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">
                    When someone is lost, they do not need more options. They
                    need someone willing to point at the way — and willing to
                    change their mind when the case is made.
                  </p>
                </div>
              </div>
            </RevealOnScroll>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   SECTION 5 — THE EXECUTION TOOLS
   ============================================================ */
const TOOLS: Array<{
  icon: typeof Mic;
  name: string;
  tagline: string;
  body: string;
  example: string;
}> = [
  {
    icon: Mic,
    name: "Conversation Coach",
    tagline: "Rehearse the pitch before you walk in.",
    body: "Tell it who you're talking to and what you're afraid of. It produces the opening, the asks, the objections you'll face — then role-plays the conversation in character so you can practise before it matters.",
    example:
      "Plays the supplier you're negotiating with. Pushes back the way they would. Doesn't make it artificially easy.",
  },
  {
    icon: Send,
    name: "Outreach Composer",
    tagline: "Your messages, written and ready to send.",
    body: "Single message, batch of ten variations, or a Day 1 / Day 5 / Day 14 sequence — for WhatsApp, email, or LinkedIn. Each one comes with a short note explaining why it works, so you learn the pattern.",
    example:
      "\"Follow up with the five owners who didn't respond on Tuesday.\" Three messages, ready to copy and send.",
  },
  {
    icon: Search,
    name: "Research Tool",
    tagline: "Find the people, the competitors, the answers.",
    body: "Ask in plain language. Get back structured findings — businesses, people, competitors, regulations — with contact information, source URLs, and a verified / likely / unverified label on each one.",
    example:
      "\"Five biggest restaurant suppliers in Freetown and what they charge.\" Names, sites, prices, sources.",
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
              The tools
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={60}>
            <h2
              id="tools-heading"
              className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
            >
              Built for the work that decides whether you win.
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={120}>
            <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
              The first cold message. The pricing call. The conversation with
              the partner you've been avoiding. These moments decide outcomes.
              We built the tools for them.
            </p>
          </RevealOnScroll>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
          {TOOLS.map((tool, i) => {
            const Icon = tool.icon;
            return (
              <RevealOnScroll key={tool.name} delayMs={i * 100}>
                <article className="group h-full rounded-xl border border-slate-800 bg-navy-950 p-7 transition-all hover:border-primary/40 hover:bg-navy-800/60">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/30">
                    <Icon
                      className="h-5 w-5 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-white">
                    {tool.name}
                  </h3>
                  <p className="mt-2 text-sm font-medium text-gold">
                    {tool.tagline}
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-slate-300">
                    {tool.body}
                  </p>
                  <div className="mt-6 rounded-md border border-slate-800 bg-navy-900 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      What it does
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">
                      {tool.example}
                    </p>
                  </div>
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
              className="text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
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
                className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
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
const TIERS: Array<{
  name: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
}> = [
  {
    name: "Free",
    description:
      "The full discovery interview and your first recommendation.",
    features: [
      "Complete discovery interview",
      "One full recommendation, with reasoning",
      "Push back up to seven rounds",
      "See the alternatives the system rejected",
    ],
    cta: "Start free",
  },
  {
    name: "Starter",
    description:
      "The full execution roadmap with all three internal tools.",
    features: [
      "Phased execution roadmap",
      "Conversation Coach",
      "Outreach Composer",
      "Research Tool",
      "Task check-ins and diagnostic help",
      "Parking lot for adjacent ideas",
    ],
    highlighted: true,
    cta: "Start free",
  },
  {
    name: "Builder",
    description: "Everything in Starter, plus validation and continuation.",
    features: [
      "Everything in Starter",
      "Live validation landing page",
      "Build brief from real market signal",
      "Continuation brief at cycle end",
      "Fork selection into next cycle",
    ],
    cta: "Start free",
  },
  {
    name: "Scale",
    description: "Multiple concurrent roadmaps with cross-cycle memory.",
    features: [
      "Everything in Builder",
      "Multiple roadmaps in parallel",
      "Priority research and synthesis",
      "Full cross-cycle memory",
    ],
    cta: "Start free",
  },
];

function Pricing() {
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
              className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
            >
              Each tier unlocks the next layer of the journey.
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delayMs={120}>
            <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
              The free tier earns trust. The paid tiers deliver transformation.
              Pricing reflects what founders at each tier actually get.
            </p>
          </RevealOnScroll>
        </div>

        <div className="mx-auto mt-14 grid max-w-7xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier, i) => (
            <RevealOnScroll key={tier.name} delayMs={i * 80}>
              <article
                className={`relative flex h-full flex-col rounded-xl border p-7 transition-colors ${
                  tier.highlighted
                    ? "border-primary bg-navy-800 shadow-lg shadow-primary/10"
                    : "border-slate-800 bg-navy-900 hover:border-slate-700"
                }`}
              >
                {tier.highlighted && (
                  <span className="absolute -top-3 left-7 inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                    Most founders start here
                  </span>
                )}
                <h3 className="text-lg font-semibold text-white">
                  {tier.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {tier.description}
                </p>
                <p className="mt-6 text-sm font-medium text-slate-300">
                  Pricing announced soon
                </p>
                <ul className="mt-6 space-y-2.5 text-sm">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-slate-300"
                    >
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          tier.highlighted
                            ? "text-primary"
                            : "text-success"
                        }`}
                        aria-hidden="true"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  <Link
                    href="/discovery"
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 ${
                      tier.highlighted
                        ? "bg-primary text-white hover:bg-blue-700 focus-visible:ring-primary"
                        : "border border-slate-700 bg-transparent text-white hover:border-slate-500 hover:bg-slate-800 focus-visible:ring-slate-500"
                    }`}
                  >
                    {tier.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            </RevealOnScroll>
          ))}
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
              className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl"
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
