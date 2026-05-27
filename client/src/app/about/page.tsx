import type { Metadata } from "next";
import {
  EditorialPage,
  SatelliteHero,
  SatelliteSection,
  SatelliteClosing,
} from "@/components/marketing/satellite";

const ABOUT_DESCRIPTION =
  "Why we built NeuraLaunch — the gap between where someone is and where they could be should not be decided by what they already have.";

export const metadata: Metadata = {
  title: "About — NeuraLaunch",
  description: ABOUT_DESCRIPTION,
  openGraph: {
    title: "About — NeuraLaunch",
    description: ABOUT_DESCRIPTION,
    type: "website",
    siteName: "NeuraLaunch",
  },
  twitter: {
    card: "summary_large_image",
    title: "About — NeuraLaunch",
    description: ABOUT_DESCRIPTION,
  },
};

export default function AboutPage() {
  return (
    <EditorialPage>
      <SatelliteHero
        stamps={[
          { text: "NeuraLaunch · About" },
          { text: "Our conviction", live: true },
          { text: "Tabempa Engineering · Freetown" },
        ]}
        title={
          <>
            The gap between<br />
            <em>where someone is</em><br />
            and <em>where they could be</em><br />
            should not be decided<br />
            by what they already have.
          </>
        }
        standfirst={
          <>
            <p>
              Not their money. Not their connections. Not their geography.{" "}
              <strong>NeuraLaunch is our answer to that belief</strong> — built
              by three people in Freetown, Sierra Leone, with the conviction
              that the right guide at the right moment can change a life.
            </p>
            <p>
              We are not a corporation. We are not a VC-backed team of fifty.
              We are a small group of people who believe the gap between{" "}
              <em>lost</em> and <em>launched</em> should not be a function of
              accident of birth — and that an AI partner, given the right shape,
              can close it.
            </p>
          </>
        }
      />

      {/* § I — Why we built it */}
      <SatelliteSection
        id="story"
        num="I."
        stamp="Why we built it"
        heading={
          <>
            The world has consultants.<br />
            The world has AI tools.<br />
            <em>Neither was the thing.</em>
          </>
        }
      >
        <div aria-hidden="true" />
        <div className="max-w-[780px]">
          <Prose>
            <p>
              Every day, millions of people wake up stuck. The graduate who
              applied everywhere and got nowhere. The shop owner whose growth
              stalled and who can&rsquo;t see why. The founder with early
              traction who hit a wall. The professional drowning in options.
            </p>
            <p>
              What they share isn&rsquo;t <em>failure.</em> It&rsquo;s the
              absence of the right guide at the right moment.{" "}
              <strong>Consultants exist</strong> — but they&rsquo;re expensive,
              generic, and built for companies that already have money.{" "}
              <strong>AI tools exist</strong> — but they hand you five options
              when you needed one answer, and they leave you alone the moment
              the answer is delivered.
            </p>
            <p>
              Nothing had been built for the moments <em>in between.</em>{" "}
              Nothing listened first, committed to one direction, and then
              stayed through the work of making that direction real.
            </p>
          </Prose>

          <PullQuote
            label="The founding moment"
            quote={
              <>
                So we built it. <em>Two engineers and an operator</em>, working
                from Freetown, with the conviction that the right guide at the
                right moment can change a life.
              </>
            }
            cite="— The founding team · Tabempa Engineering Limited"
          />
        </div>
      </SatelliteSection>

      {/* § II — What we believe */}
      <SatelliteSection
        id="beliefs"
        num="II."
        stamp="What we believe"
        heading={
          <>
            Four convictions<br />
            shape <em>every decision.</em>
          </>
        }
      >
        <div aria-hidden="true" />
        <div className="grid">
          {BELIEFS.map((b, i) => (
            <Belief
              key={b.roman}
              roman={b.roman}
              title={b.title}
              body={b.body}
              keyword={b.keyword}
              firstChild={i === 0}
              lastChild={i === BELIEFS.length - 1}
            />
          ))}
        </div>
      </SatelliteSection>

      {/* § III — The company */}
      <SatelliteSection
        id="company"
        num="III."
        stamp="The company"
        heading={
          <>
            A product of<br />
            <em>Tabempa Engineering Limited.</em>
          </>
        }
      >
        <div aria-hidden="true" />
        <div className="max-w-[780px]">
          <Prose>
            <p>
              Headquartered in <strong>Freetown, Sierra Leone</strong> — a
              vantage point that informs how we think about access, constraint,
              and the difference a single clear direction can make for someone
              whose options are <em>genuinely limited.</em>
            </p>
            <p>
              Built by three people, held to the engineering standards of a
              senior team at a world-class technology company. We are small, we
              are deliberate, and we are not in a hurry.
            </p>
          </Prose>

          {/* Facts — 2×2 hairline grid */}
          <div className="mt-10 grid max-w-[840px] grid-cols-1 border border-rule sm:grid-cols-2">
            <Fact k="Founded" v={<span className="text-accent">2026</span>} />
            <Fact
              k="Built from"
              v={
                <>
                  Freetown, <span className="text-accent">Sierra Leone</span>
                </>
              }
            />
            <Fact
              k="Team"
              v={
                <>
                  Three. <span className="text-accent">No outside capital.</span>
                </>
              }
            />
            <Fact
              k="Built for"
              v={
                <>
                  <span className="text-accent">Everyone</span> stuck.
                </>
              }
            />
          </div>

          {/* Team — 3-up founders ledger */}
          <div className="mt-12 grid max-w-[1000px] grid-cols-1 border-y border-rule-strong sm:grid-cols-3">
            <Person
              role="I. Founder & CEO"
              name="Alpha Saheed Mansaray"
              note="The believer."
            />
            <Person
              role="II. Co-founder & Chief Engineer"
              name="Saheed Alpha Mansaray"
              note="The builder."
            />
            <Person
              role="III. Chief Operating Officer"
              name="John Bismark Sesay"
              note="The operator."
            />
          </div>
        </div>
      </SatelliteSection>

      <SatelliteClosing
        heading={
          <>
            The best way to understand what we&rsquo;re building is to{" "}
            <em>use it.</em>
          </>
        }
        body={
          <>
            One honest interview. One clear direction. A partner with you
            through <em>the work that follows.</em>
          </>
        }
        cta={{ href: "/discovery", label: "Begin Discovery" }}
        quiet="Free to start · No card · ~12 minutes"
      />
    </EditorialPage>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page-local primitives                                                     */
/* -------------------------------------------------------------------------- */

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="
        text-[18px] leading-[1.65] text-fg-2
        [&_p+p]:mt-4
        [&_p:first-of-type::first-letter]:float-left
        [&_p:first-of-type::first-letter]:mr-3 [&_p:first-of-type::first-letter]:mt-1.5
        [&_p:first-of-type::first-letter]:font-serif [&_p:first-of-type::first-letter]:italic
        [&_p:first-of-type::first-letter]:text-[3.2em] [&_p:first-of-type::first-letter]:leading-[0.9]
        [&_p:first-of-type::first-letter]:text-accent
        [&_em]:font-serif [&_em]:italic [&_em]:text-accent
        [&_strong]:font-medium [&_strong]:text-fg
      "
    >
      {children}
    </div>
  );
}

function PullQuote({
  label,
  quote,
  cite,
}: {
  label: string;
  quote: React.ReactNode;
  cite: string;
}) {
  return (
    <div className="mt-12 border-b border-rule border-t border-t-accent py-9">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        {label}
      </p>
      <blockquote
        className="
          mt-4 max-w-[880px] font-serif italic text-fg
          [font-size:clamp(28px,3.6vw,44px)] [line-height:1.2] [letter-spacing:-0.015em]
          [&_em]:not-italic [&_em]:text-accent
        "
      >
        {quote}
      </blockquote>
      <cite className="mt-4 block font-mono text-[11px] not-italic uppercase tracking-[0.14em] text-muted">
        {cite}
      </cite>
    </div>
  );
}

interface BeliefData {
  roman: string;
  title: React.ReactNode;
  body: React.ReactNode;
  keyword: { lab: string; lines: string[] };
}

const BELIEFS: BeliefData[] = [
  {
    roman: "i.",
    title: (
      <>
        One answer is more useful than <em>five options.</em>
      </>
    ),
    body: (
      <>
        When someone is lost, they don&rsquo;t need more options to evaluate —
        they need a direction they can <strong>trust.</strong> And someone
        willing to defend it, or change their mind when the case is made.
        Indecision dressed up as choice is the most expensive kind of advice.
      </>
    ),
    keyword: {
      lab: "The principle",
      lines: ["Commitment over hedge", "One recommendation, defended", "Argued with, not menu'd"],
    },
  },
  {
    roman: "ii.",
    title: (
      <>
        The <em>work</em> decides the outcome — not the strategy.
      </>
    ),
    body: (
      <>
        The moments that decide whether a founder wins are{" "}
        <strong>not the moments code gets written.</strong> They&rsquo;re the
        first cold message. The pricing call. The conversation with the partner
        you&rsquo;ve been avoiding. We built tools for that work, not for the
        autogenerated MVP that ships nothing.
      </>
    ),
    keyword: {
      lab: "The principle",
      lines: ["Conversations before code", "Coach · Composer · Research", "Validation before build"],
    },
  },
  {
    roman: "iii.",
    title: (
      <>
        Listen <em>before</em> you recommend.
      </>
    ),
    body: (
      <>
        The quality of the answer is{" "}
        <strong>bounded by the quality of the understanding.</strong>{" "}
        NeuraLaunch interviews the situation, notices when the surface answer
        isn&rsquo;t the real one, and earns the right to recommend by asking
        first. Up to fifteen questions. Capped, so it ends.
      </>
    ),
    keyword: {
      lab: "The principle",
      lines: ["Context before conclusion", "15-field belief state", "Audience-aware"],
    },
  },
  {
    roman: "iv.",
    title: (
      <>
        Stay through the <em>cycle.</em>
      </>
    ),
    body: (
      <>
        A plan you receive once is a document you&rsquo;ll close in a week. A
        partner that <strong>stays</strong> — through the blocks, the wins, the
        recalibrations — is the difference between a roadmap on paper and a
        roadmap that ships. The continuation brief at the end of each cycle is
        the proof.
      </>
    ),
    keyword: {
      lab: "The principle",
      lines: ["Partner, not tool", "Check-ins · recalibration", "The next cycle is smarter"],
    },
  },
];

function Belief({
  roman,
  title,
  body,
  keyword,
  firstChild,
  lastChild,
}: {
  roman: string;
  title: React.ReactNode;
  body: React.ReactNode;
  keyword: { lab: string; lines: string[] };
  firstChild?: boolean;
  lastChild?: boolean;
}) {
  return (
    <article
      className={[
        "grid gap-12 py-12 lg:grid-cols-[120px_1fr_280px] lg:gap-14",
        firstChild
          ? "border-t border-rule-strong"
          : "border-t border-rule",
        lastChild ? "border-b border-rule-strong" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="font-serif text-[72px] italic leading-none tracking-[-0.02em] text-accent">
        {roman}
      </div>
      <div>
        <h3 className="font-serif text-[clamp(30px,3.4vw,44px)] font-normal italic leading-[1.1] tracking-[-0.015em] text-fg [&_em]:text-accent">
          {title}
        </h3>
        <p
          className="
            mt-4 max-w-[560px] text-[16px] leading-[1.6] text-fg-2
            [&_em]:font-serif [&_em]:italic [&_em]:text-accent
            [&_strong]:font-medium [&_strong]:text-fg
          "
        >
          {body}
        </p>
      </div>
      <div className="font-mono text-[11px] leading-[1.7] tracking-[0.14em] text-muted">
        <span className="mb-1.5 block text-[10px] tracking-[0.18em] font-medium text-accent">
          {keyword.lab}
        </span>
        {keyword.lines.map((line, i) => (
          <span key={i} className="block normal-case tracking-[0.04em]">
            {line}
          </span>
        ))}
      </div>
    </article>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="border-b border-rule p-6 last:border-b-0 sm:[&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n+1)]:border-r sm:[&:nth-child(2n+1)]:border-rule sm:[&:nth-last-child(-n+2)]:border-b-0">
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        {k}
      </div>
      <div className="font-serif text-[28px] italic leading-[1.1] tracking-[-0.015em] text-fg">
        {v}
      </div>
    </div>
  );
}

function Person({
  role,
  name,
  note,
}: {
  role: string;
  name: string;
  note: string;
}) {
  return (
    <div className="border-r border-rule p-7 last:border-r-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        {role}
      </div>
      <div className="mt-2.5 font-sans text-[20px] font-medium leading-[1.15] tracking-[-0.01em] text-fg">
        {name}
      </div>
      <div className="mt-1.5 font-serif text-[15px] italic leading-[1.4] text-fg-2">
        {note}
      </div>
    </div>
  );
}
