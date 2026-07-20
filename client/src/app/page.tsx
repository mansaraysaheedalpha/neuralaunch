import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { PricingSection } from "@/components/marketing/PricingSection";
import { getPriceIds } from "@/lib/paddle/founding-members";

const HERO_SUBHEAD =
  "NeuraLaunch interviews your situation, commits to one clear recommendation, and partners with you through every task — until you've shipped, learned, or decided what comes next.";

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

export default async function LandingPage() {
  // Resolve per-tier Paddle price ids server-side. The hidden founding
  // rate is returned only while slots remain — switching to the standard
  // monthly the moment the 50-user ceiling is hit.
  const [execute, compound] = await Promise.all([
    getPriceIds("execute"),
    getPriceIds("compound"),
  ]);

  return (
    <div className="min-h-screen bg-bg text-fg antialiased">
      <MarketingHeader />
      <main id="main">
        <Hero />
        <Cycle />
        <Surface />
        <Toolkit />
        <Pricing execute={execute} compound={compound} />
        <Closing />
      </main>
      <MarketingFooter />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                       */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative border-b border-rule">
      {/* Radial accent wash — only graphic primitive on the landing. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 320px at 20% 30%, rgba(255,90,60,0.10), transparent 60%)",
        }}
      />
      <div className="relative mx-auto max-w-[1320px] px-6 pb-20 pt-16 sm:px-10 sm:pt-20 lg:pb-24 lg:pt-24">
        {/* Stamp row */}
        <div className="mb-14 flex flex-wrap items-baseline justify-between gap-6 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          <span>NeuraLaunch · Tabempa Engineering</span>
          <span className="text-accent">Discovery · Open</span>
          <span>From lost to launched · 2026</span>
        </div>

        <h1
          id="hero-heading"
          className="max-w-[1100px] font-sans font-medium text-fg [font-size:clamp(40px,5.5vw,88px)] [line-height:0.98] [letter-spacing:-0.03em]"
        >
          You know something<br />
          needs to change.{" "}
          <span className="text-accent">
            We&rsquo;ll tell you what —<br />and walk it with you.
          </span>
        </h1>

        <div className="mt-14 grid items-end gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="max-w-[600px] text-[18px] leading-[1.5] text-fg-2">
              NeuraLaunch interviews your situation, commits to{" "}
              <strong className="font-medium text-fg">one</strong> clear
              recommendation, and partners with you through every task — until
              you&rsquo;ve shipped, learned, or decided what comes next.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3.5" id="start">
              <PrimaryCTA href="/discovery">Begin Discovery</PrimaryCTA>
              <Link
                href="#cycle"
                className="inline-flex items-center gap-2.5 border border-rule-strong px-[22px] py-[16px] font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-fg transition-colors hover:border-fg"
              >
                Read the cycle
              </Link>
            </div>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Free to start · No card · ~12 minutes
            </p>
          </div>

          <dl className="grid gap-3.5 border-l border-rule pl-7 lg:pl-9">
            <MeterRow k="Engine" v="Multi-cycle, multi-phase" />
            <MeterRow k="Models" v="Opus · Sonnet · Haiku" />
            <MeterRow k="Tools shipped" v="5 · Execute+" />
            <MeterRow k="Recommendation count" v="One." accent />
          </dl>
        </div>
      </div>
    </section>
  );
}

function MeterRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {k}
      </dt>
      <dd
        className={`font-mono text-[13px] ${
          accent ? "text-accent" : "text-fg"
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  § 01 The Cycle                                                             */
/* -------------------------------------------------------------------------- */

const CYCLE_STEPS = [
  {
    n: "01",
    title: <>Be heard.</>,
    body: "A 4-phase interview builds a fifteen-field belief state. Up to fifteen questions. Audience-aware. Capped, so it ends.",
    annotLab: "Discovery",
    annotBody:
      "Orientation → goals → constraints → conviction. Hard cap at 15.",
  },
  {
    n: "02",
    title: (
      <>
        One <span className="text-accent">recommendation.</span>
      </>
    ),
    body: "Synthesised across the full belief state. With reasoning, risks, assumptions you can flag, and the alternatives that were rejected — and why, for you specifically.",
    annotLab: "Phase 1B emission",
    annotBody: "Opus 4.6 reasons, Sonnet formats. No menus. No hedge.",
  },
  {
    n: "03",
    title: <>Push back.</>,
    body: "Up to ten rounds of real argument. Defend, refine, replace. If you're right and the evidence agrees, the recommendation changes.",
    annotLab: "Pushback engine",
    annotBody: "Two-phase. Hard cap triggers a constrained alternative.",
  },
  {
    n: "04",
    title: (
      <>
        A real <span className="text-accent">roadmap.</span>
      </>
    ),
    body: "Phased. Sequenced. Sized to the hours you actually have. Each task carries reasoning, success criteria, and the tools we'll use to get through it.",
    annotLab: "Roadmap engine",
    annotBody: "Up to five phases. Up to five tasks per phase.",
  },
  {
    n: "05",
    title: <>Learn. Continue.</>,
    body: "At the end of every cycle: what happened, what we got wrong, what the evidence says, the forks ahead, the parking lot. The next cycle starts smarter than the last.",
    annotLab: "Continuation brief",
    annotBody: "Five sections. Auto-generated. Ready to read.",
  },
] as const;

function Cycle() {
  return (
    <section id="cycle" className="border-b border-rule">
      <div className="mx-auto max-w-[1320px] px-6 py-24 sm:px-10 lg:py-32">
        <SectionHead num="§ 01" stamp="The cycle">
          <>
            One arc. From first question<br />
            to first <span className="text-accent">outcome.</span>
          </>
        </SectionHead>

        <div className="grid gap-14 lg:grid-cols-[220px_1fr] lg:gap-14">
          <div aria-hidden="true" />
          <ol className="grid">
            {CYCLE_STEPS.map((step, i) => (
              <li
                key={step.n}
                className={[
                  "grid items-start gap-10 py-9",
                  "lg:grid-cols-[80px_1fr_280px]",
                  i === 0
                    ? "border-t border-rule-strong"
                    : "border-t border-rule",
                ].join(" ")}
              >
                <span className="font-mono text-[12px] tracking-[0.14em] text-accent">
                  {step.n}
                </span>
                <div>
                  <h3 className="font-sans font-medium text-fg [font-size:clamp(28px,3vw,40px)] [line-height:1.05] [letter-spacing:-0.02em]">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-[520px] text-[15px] leading-[1.55] text-fg-2">
                    {step.body}
                  </p>
                  {/* Stories footnote rides Step V — see judgement-call note. */}
                  {step.n === "05" && (
                    <ul className="mt-5 grid max-w-[520px] gap-2.5 border-t border-rule pt-4 font-serif text-[14px] italic leading-[1.5] text-fg-2">
                      <li className="before:mr-2 before:text-accent before:content-['—']">
                        &ldquo;The recommendation read me back to myself.&rdquo; — placeholder, backfill from stories archive.
                      </li>
                      <li className="before:mr-2 before:text-accent before:content-['—']">
                        &ldquo;Got the day-job-friendly cycle I needed.&rdquo; — placeholder, backfill from stories archive.
                      </li>
                      <li className="before:mr-2 before:text-accent before:content-['—']">
                        &ldquo;Pushback round 6 changed everything.&rdquo; — placeholder, backfill from stories archive.
                      </li>
                    </ul>
                  )}
                </div>
                <div className="font-mono text-[11px] leading-[1.65] tracking-[0.04em] text-muted">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-fg">
                    {step.annotLab}
                  </span>
                  {step.annotBody}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  § 02 A Recommendation                                                      */
/* -------------------------------------------------------------------------- */

function Surface() {
  return (
    <section id="surface" className="border-b border-rule">
      <div className="mx-auto max-w-[1320px] px-6 py-24 sm:px-10 lg:py-32">
        <SectionHead num="§ 02" stamp="A recommendation">
          <>
            This is what a real one<br />
            looks <span className="text-accent">like.</span>
          </>
        </SectionHead>

        <div className="grid gap-14 lg:grid-cols-[220px_1fr]">
          <p className="font-sans font-normal text-fg [font-size:clamp(28px,3vw,40px)] [line-height:1.15] [letter-spacing:-0.015em] max-w-[760px]">
            <span className="italic text-muted">Not a menu.</span>{" "}
            One direction, for your specific situation, with reasoning,
            risks, and what would make it{" "}
            <span className="text-accent">wrong</span> — all on the table.
          </p>

          <article
            aria-label="Sample recommendation"
            className="relative overflow-hidden border border-rule-strong bg-[linear-gradient(180deg,#111114_0%,#0e0e10_100%)] before:absolute before:left-0 before:right-0 before:top-0 before:h-[2px] before:bg-accent before:content-['']"
          >
            <header className="flex items-center justify-between border-b border-rule px-9 py-7 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              <span>Recommendation · Cycle 01</span>
              <span className="text-accent">Confidence · High</span>
            </header>

            <div className="px-9 pb-9 pt-11">
              <h3 className="font-sans font-medium text-fg [font-size:clamp(34px,4vw,56px)] [line-height:1.02] [letter-spacing:-0.02em] max-w-[880px]">
                Spend the next three weeks proving demand for the maternal-care
                advisory line.{" "}
                <span className="font-serif font-normal italic text-accent">
                  Not building the app.
                </span>
              </h3>
              <p className="mb-8 mt-5 max-w-[720px] text-[16px] leading-[1.55] text-fg-2">
                You have a clinical network, a real WhatsApp following, and a
                shortage of hours. The app will eat 200 hours before anyone
                says yes. A three-week paid advisory pilot, run from your
                existing channel, will tell you within thirty days whether to
                build at all — and at what price.
              </p>

              <div className="grid border-y border-rule lg:grid-cols-3">
                <RecCell k="First three steps">
                  <p>
                    <b className="font-medium text-fg">① Frame the pilot</b> as
                    a 30-day paid line.
                    <br />
                    <b className="font-medium text-fg">② Recruit</b> ten
                    existing followers at NLe 200/mo.
                    <br />
                    <b className="font-medium text-fg">③ Run</b> consultations
                    via WhatsApp Business.
                  </p>
                </RecCell>
                <RecCell k="Time to first result">
                  <p>
                    <b className="font-medium text-fg">14 days.</b> First paid
                    consultation booked.
                  </p>
                  <p className="mt-3">
                    Sized against the 8 weekly hours you stated.
                  </p>
                </RecCell>
                <RecCell k="What would make this wrong">
                  <p>
                    If &lt; 3 of 10 followers say yes at price, the advisory
                    frame is wrong — pivot to free-tier triage with
                    escalation, not a paid line.
                  </p>
                </RecCell>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3.5 px-9 py-7">
              <div className="flex flex-wrap gap-5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                <span>3 assumptions · flaggable</span>
                <span>2 alternatives · rejected</span>
                <span className="text-accent">Push back · 10 rounds</span>
              </div>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-2.5 bg-fg px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg opacity-90"
              >
                Accept · Build roadmap →
              </button>
            </footer>
          </article>
        </div>
      </div>
    </section>
  );
}

function RecCell({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="border-rule px-0 py-6 first:pl-0 lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:pl-8 lg:[&:not(:last-child)]:pr-8">
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {k}
      </div>
      <div className="text-[14px] leading-[1.55] text-fg-2">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  § 03 The Toolkit                                                           */
/* -------------------------------------------------------------------------- */

const TOOLS = [
  {
    idx: "001",
    name: "Conversation Coach",
    tag: "Opus",
    desc: "Rehearse the pitch. Channel-native opening, anticipated objections, fallback positions — then a role-play in character.",
  },
  {
    idx: "002",
    name: "Outreach Composer",
    tag: "Sonnet",
    desc: "WhatsApp, email, LinkedIn. Single, batch, or D1 / D5 / D14 sequence — each with a note on why it works.",
  },
  {
    idx: "003",
    name: "Research Tool",
    tag: "Opus · 25 step",
    desc: "Plain-language query, structured findings, source URLs, confidence labels — verified, likely, unverified.",
  },
  {
    idx: "004",
    name: "Service Packager",
    tag: "Sonnet",
    desc: "Three priced tiers from your situation. Starter, Pro, Premium — with revenue scenarios and reasoning.",
  },
  {
    idx: "005",
    name: "Validation Page",
    tag: "Public",
    desc: "A live landing page with surveys and analytics. Real demand signal before you write a line of code.",
  },
] as const;

function Toolkit() {
  return (
    <section id="tools" className="border-b border-rule">
      <div className="mx-auto max-w-[1320px] px-6 py-24 sm:px-10 lg:py-32">
        <SectionHead num="§ 03" stamp="The toolkit">
          <>
            Five tools, for the work<br />
            that decides the <span className="text-accent">outcome.</span>
          </>
        </SectionHead>

        <div className="grid gap-14 lg:grid-cols-[220px_1fr]">
          <div aria-hidden="true" />
          <ul className="grid">
            {TOOLS.map((tool, i) => (
              <li
                key={tool.idx}
                className={[
                  "group grid items-baseline gap-10 py-7 transition-colors",
                  "lg:grid-cols-[60px_1.2fr_2fr]",
                  i === 0
                    ? "border-t border-rule-strong"
                    : "border-t border-rule",
                  "hover:bg-[linear-gradient(180deg,transparent,rgba(255,90,60,0.04))]",
                ].join(" ")}
              >
                <span className="font-mono text-[12px] tracking-[0.14em] text-accent">
                  {tool.idx}
                </span>
                <span className="font-sans font-medium [font-size:clamp(22px,2.3vw,30px)] [letter-spacing:-0.015em] text-fg">
                  {tool.name}
                </span>
                <span className="max-w-[560px] text-[15px] leading-[1.5] text-fg-2">
                  <span className="mr-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {tool.tag}
                  </span>
                  {tool.desc}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  § 04 Price                                                                 */
/* -------------------------------------------------------------------------- */

interface TierPricing {
  monthly: string;
  annual: string;
  isFoundingRate: boolean;
  foundingSlotsRemaining: number;
  foundingMonthly: string;
}

function Pricing({
  execute,
  compound,
}: {
  execute: TierPricing;
  compound: TierPricing;
}) {
  return (
    <section id="pricing" className="scroll-mt-20 border-b border-rule">
      <div className="mx-auto max-w-[1320px] px-6 py-24 sm:px-10 lg:py-32">
        <SectionHead num="§ 04" stamp="Price">
          <>
            Each tier unlocks the next<br />
            layer of the <span className="text-accent">journey.</span>
          </>
        </SectionHead>

        <PricingSection execute={execute} compound={compound} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Closing                                                                    */
/* -------------------------------------------------------------------------- */

function Closing() {
  return (
    <section className="relative">
      <div className="relative mx-auto max-w-[1320px] px-6 py-32 sm:px-10 lg:py-40">
        <p className="mb-8 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
          Eight weeks from today
        </p>
        <h2 className="font-sans font-medium text-fg [font-size:clamp(56px,8vw,132px)] [line-height:0.94] [letter-spacing:-0.03em]">
          You&rsquo;ll{" "}
          <span className="font-serif font-normal italic text-accent">
            know.
          </span>
        </h2>
        <p className="mt-7 max-w-[540px] text-[19px] leading-[1.45] text-fg-2">
          Either you&rsquo;ve shipped. Or you&rsquo;ve learned what to change.
          Or you&rsquo;ve decided this isn&rsquo;t the path — with proof.
          Whichever it is, you won&rsquo;t be guessing anymore.
        </p>
        <div className="mt-9">
          <PrimaryCTA href="/discovery">Begin Discovery</PrimaryCTA>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared primitives                                                          */
/* -------------------------------------------------------------------------- */

function SectionHead({
  num,
  stamp,
  children,
}: {
  num: string;
  stamp: string;
  children: React.ReactNode;
}) {
  return (
    <header className="mb-16 grid items-end gap-12 lg:mb-20 lg:grid-cols-[220px_1fr] lg:gap-14">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        <span className="mb-1.5 block text-fg">{num}</span>
        {stamp}
      </div>
      <h2 className="font-sans font-medium text-fg [font-size:clamp(44px,5.6vw,80px)] [line-height:0.98] [letter-spacing:-0.025em] max-w-[940px]">
        {children}
      </h2>
    </header>
  );
}

function PrimaryCTA({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-3 bg-accent px-[22px] py-[16px] font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5"
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}
