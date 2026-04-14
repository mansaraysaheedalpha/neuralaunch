import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import RevealOnScroll from "@/components/marketing/RevealOnScroll";

export const metadata: Metadata = {
  title: "Questions & Answers — NeuraLaunch",
  description:
    "How NeuraLaunch works — the discovery interview, the one recommendation, the roadmap, the internal tools, the check-ins, and the continuation cycle.",
  openGraph: {
    title: "Questions & Answers — NeuraLaunch",
    description:
      "How NeuraLaunch works, from the first interview question through to the continuation brief.",
    type: "website",
    siteName: "NeuraLaunch",
  },
  twitter: {
    card: "summary_large_image",
    title: "Questions & Answers — NeuraLaunch",
    description: "How NeuraLaunch works, end to end.",
  },
};

interface QA {
  question: string;
  answer: string;
}

interface Category {
  id: string;
  title: string;
  blurb: string;
  items: QA[];
}

// Apostrophes use the Unicode right-single-quotation-mark (U+2019) so they
// render as proper curly quotes. Straight ASCII would also work.
const CATEGORIES: Category[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blurb: "What NeuraLaunch is, who it’s for, and how a session begins.",
    items: [
      {
        question: "What is NeuraLaunch?",
        answer:
          "NeuraLaunch is a growth engine and execution partner. It interviews your situation, commits to one clear recommendation for your specific circumstances, generates an execution roadmap sized to the hours you actually have, and stays with you through the work — with a Conversation Coach, an Outreach Composer, a Research Tool, a check-in system, and a continuation brief that interprets what you learned at the end of each cycle.",
      },
      {
        question: "Who is NeuraLaunch built for?",
        answer:
          "Five kinds of people in particular: graduates with skills but no clear path; founders whose previous attempt stalled; established business owners looking to grow; aspiring builders with an idea but no execution route; and mid-journey professionals balancing a career with a side project. NeuraLaunch adapts its tone, question priority, and roadmap rules to each.",
      },
      {
        question: "How do I get started?",
        answer:
          "Sign in with Google or GitHub, click “Start Your Discovery,” and answer the questions the system asks. There is no form to fill in and no dashboard to configure. The first thing that happens is a conversation.",
      },
      {
        question: "Do I need to be technical to use it?",
        answer:
          "No. NeuraLaunch is built for everyone — graduates, shop owners, founders, professionals. The system meets you exactly where you are, and roadmaps for non-technical paths look entirely different from roadmaps for software paths. Technical ability is one of the things the interview asks about, and it shapes what gets recommended.",
      },
    ],
  },
  {
    id: "discovery",
    title: "The discovery interview",
    blurb: "How the system learns about you before recommending anything.",
    items: [
      {
        question: "How long does the interview take?",
        answer:
          "Typically between five and fifteen questions, depending on how completely you answer. There is a hard ceiling at fifteen — beyond that, the system is required to commit to a recommendation rather than keep asking.",
      },
      {
        question: "What does it actually ask about?",
        answer:
          "Four areas: who you are (background, situation, what you’ve already tried), what you want (the goal, what success looks like, the time horizon), the constraints (hours per week, budget, team size, technical ability, your geographic market), and your conviction (commitment level, biggest concern, why now, what genuinely drives you).",
      },
      {
        question: "Can I leave and come back later?",
        answer:
          "Yes. If you walk away mid-interview and return within roughly 72 hours, the session resumes exactly where you left off — every previous answer is still there.",
      },
      {
        question: "What if I’m stuck on a question?",
        answer:
          "Ask whatever you actually want to know. The system distinguishes between answers, off-topic questions, frustration, requests for clarification, and signals that a follow-up topic deserves its own thread. It will respond to each in kind, then re-invite you back to the question.",
      },
    ],
  },
  {
    id: "recommendation",
    title: "The recommendation",
    blurb: "What you receive at the end of the interview, and what to do with it.",
    items: [
      {
        question: "Why one recommendation? Why not show me options?",
        answer:
          "When someone is lost, more options is the opposite of helpful. A real recommendation requires the system to take a position. NeuraLaunch hands you one direction, with the reasoning, the risks, the assumptions, and the alternatives it considered and rejected — for your specific situation.",
      },
      {
        question: "What if I disagree with the recommendation?",
        answer:
          "You can push back. Up to seven rounds of real argument. The system will defend its position when it should, refine where your point is valid, and replace the recommendation entirely if you and the evidence together prove it wrong. After seven rounds, if the disagreement persists, it produces a second alternative path built from the dominant thread of your pushback.",
      },
      {
        question: "Can I flag specific assumptions in the recommendation?",
        answer:
          "Yes. Every assumption the recommendation rests on can be flagged individually. Click the flag and the system tells you, in two or three sentences, exactly how the recommendation changes if that assumption turns out to be false.",
      },
      {
        question: "What happens when I accept it?",
        answer:
          "An execution roadmap is generated for that recommendation — phased, sequenced, sized to your stated weekly hours, with success criteria for every task. For software-product recommendations, you also get the option to generate a validation landing page.",
      },
    ],
  },
  {
    id: "roadmap",
    title: "The roadmap and the tools",
    blurb:
      "How execution actually works — task by task, with the AI alongside you.",
    items: [
      {
        question: "What does the roadmap look like?",
        answer:
          "Two to six phases. Up to five tasks per phase. Each task carries a description, a rationale, a realistic time estimate against your hours, and a success criterion you can actually check. Many tasks suggest a specific NeuraLaunch tool — Conversation Coach, Outreach Composer, or Research Tool — to use at the right moment.",
      },
      {
        question: "What does the Conversation Coach do?",
        answer:
          "It helps you rehearse a high-stakes conversation before you walk in. You tell it who you’re talking to, your relationship to them, what you want, and what you’re afraid of. It produces a preparation package — opening script, key asks, anticipated objections with grounded responses, fallback positions, and a post-conversation checklist. Then it role-plays the conversation with you, in character, without making it artificially easy.",
      },
      {
        question: "What does the Outreach Composer do?",
        answer:
          "It writes the messages you actually send. Single message, batch of five-to-ten variations, or a Day 1 / Day 5 / Day 14 follow-up sequence — for WhatsApp, email, or LinkedIn. Each message comes with a short note explaining why it works. If you don’t like one, ask for a variation with a specific instruction and you’ll get it.",
      },
      {
        question: "What does the Research Tool do?",
        answer:
          "It finds specific information about your market, your customers, your competitors, or your city. You ask in plain language. It shows you a research plan with an honest time estimate, then runs the research — typically a few minutes for deep questions. You get back structured findings with contact information, source URLs, and a confidence level (verified, likely, or unverified) on each.",
      },
      {
        question: "Can I use the tools without a roadmap?",
        answer:
          "Yes. All three tools are also available as standalone tools from the sidebar — useful when you need one of them for something outside the current task.",
      },
    ],
  },
  {
    id: "checkins",
    title: "Check-ins and continuation",
    blurb: "How NeuraLaunch stays with you across the cycle.",
    items: [
      {
        question: "What happens when I finish a task?",
        answer:
          "You can mark it done quietly, or check in — telling the system what happened (it went well, you got stuck, something unexpected came up, or you have a question). The check-in agent responds with specific, contextual guidance that knows where you are in the roadmap, what you’ve tried before, and any tools you’ve used.",
      },
      {
        question: "What if I get stuck on a single task?",
        answer:
          "Click “Get help with this task” on any task card. A focused diagnostic chat opens that knows that task’s context. It can break the task into sub-steps, suggest tools, walk you through specific blocks, or — if the problem is bigger than the task — escalate you to the “What’s Next?” flow.",
      },
      {
        question: "What does “What’s Next?” do?",
        answer:
          "It evaluates how far you’ve gotten through the roadmap. If you’ve completed most of it, it goes straight to generating a continuation brief. If you’ve barely started or are stalled, it opens a short diagnostic conversation first to understand why, then moves to the brief.",
      },
      {
        question: "What is the continuation brief?",
        answer:
          "Five sections: what happened, what the system got wrong, what the evidence says, two-to-four concrete forks for what you could do next (each with a first step, a time estimate, and the condition under which that fork would be the right one), and the parking lot of adjacent ideas you surfaced along the way. You pick a fork and the next cycle begins — auto-accepted, with speed calibration from what you actually did feeding into the new roadmap.",
      },
      {
        question: "Will it remember me across sessions?",
        answer:
          "Yes. Every check-in, every blocked task, every parked idea is held in context. Nothing has to be re-explained. When the cycle ends, the brief draws on all of it.",
      },
    ],
  },
  {
    id: "validation",
    title: "Validation landing pages",
    blurb: "When your recommended path is to build a software product.",
    items: [
      {
        question: "Who gets a validation landing page?",
        answer:
          "Founders whose recommended path is a software product. From the recommendation hub, you can click “Build Validation Page” to generate one. Service businesses, sales motions, and other recommendation types don’t get a validation page — different paths need different proof.",
      },
      {
        question: "What goes on the page?",
        answer:
          "A clear value proposition shaped to your audience, an entry survey to capture why people arrived, an exit survey to capture why they’re leaving, feature cards drawn from your roadmap (so the features people click on are the features the market is confirming), and an email signup. Plus a distribution brief with three audience-specific channels you can post to.",
      },
      {
        question: "How do I know if it’s working?",
        answer:
          "The system aggregates visitors, scroll depth, exit intent, signups, feature clicks, and survey responses. Every six hours it interprets the data. When enough signal accumulates — visitors, clicks, surveys — a build brief is produced telling you what the market confirmed, what it rejected, and what to build next. If the signal is negative, it says so plainly and offers pivot options grounded in the disconfirmed assumptions.",
      },
    ],
  },
  {
    id: "pricing",
    title: "Pricing and access",
    blurb: "What it costs and what each tier unlocks.",
    items: [
      {
        question: "Is NeuraLaunch free?",
        answer:
          "The full discovery interview and your first recommendation are free. Paid tiers unlock the rest of the journey — execution roadmap, the three tools, check-ins, validation pages, and the continuation brief. Final pricing will reflect what founders at each tier actually get.",
      },
      {
        question: "Do I need to bring my own AI keys?",
        answer:
          "No. All AI services are included. You don’t need an Anthropic, OpenAI, or research-provider account.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy and data",
    blurb: "What we do with the things you tell us.",
    items: [
      {
        question: "Who can see my conversations and recommendations?",
        answer:
          "Only you. Your discovery sessions, recommendations, roadmaps, and tool sessions are scoped to your account. They are never shared, never shown to other users, and never used to train shared models without your explicit opt-in.",
      },
      {
        question: "Can I opt in to help train the system?",
        answer:
          "Yes — and only if you choose to. After completing a roadmap, you can opt in to share an anonymised version of the outcome (with personal identifiers stripped, locations reduced to country) to help future founders. You can revoke at any time — and revocation removes the anonymised record from existing data, not just future submissions.",
      },
      {
        question: "Can I delete my data?",
        answer:
          "Yes. You can delete individual conversations from the sidebar. For full account deletion, contact support and we’ll handle it.",
      },
    ],
  },
  {
    id: "support",
    title: "Account and support",
    blurb: "Practical questions about using the platform.",
    items: [
      {
        question: "How do I sign in?",
        answer:
          "Through Google or GitHub. There is no separate password to remember. A native mobile app exists alongside the web app and uses the same account.",
      },
      {
        question: "What if I run into a bug?",
        answer:
          "Use the feedback option inside the authenticated app to report it. Include what you were doing and what happened — the more specific, the faster we can fix it.",
      },
      {
        question: "Where can I learn more?",
        answer:
          "Read the About page for the conviction behind the product. Then start a discovery session — the best way to understand what NeuraLaunch is, is to use it.",
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-[#070F1C] text-[#F7F8FA] antialiased">
      <MarketingHeader />
      <main id="main" className="pt-16">
        <Hero />
        <Index />
        <FAQList />
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
      aria-labelledby="faq-hero"
      className="relative overflow-hidden border-b border-slate-800 bg-gradient-to-b from-[#070F1C] via-[#0A1628] to-[#0D1E38]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[400px] max-w-5xl bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.10),_transparent_60%)]"
      />
      <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-20 sm:px-6 sm:pb-24 sm:pt-28 lg:px-8 lg:pb-28">
        <div className="text-center">
          <RevealOnScroll>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-[#0D1E38]/80 px-3.5 py-1.5 text-xs font-medium text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
              Questions &amp; answers
            </p>
          </RevealOnScroll>
          <RevealOnScroll delayMs={80}>
            <h1
              id="faq-hero"
              className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl"
            >
              How NeuraLaunch works,{" "}
              <span className="text-[#D4A843]">end to end.</span>
            </h1>
          </RevealOnScroll>
          <RevealOnScroll delayMs={160}>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Honest answers to the questions founders actually ask — about the
              interview, the recommendation, the roadmap, the tools, and what
              happens at the end of a cycle.
            </p>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   CATEGORY INDEX
   ============================================================ */
function Index() {
  return (
    <section
      aria-label="Question categories"
      className="border-b border-slate-800 bg-[#070F1C]"
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <ul className="flex flex-wrap justify-center gap-2 text-sm">
          {CATEGORIES.map((cat) => (
            <li key={cat.id}>
              <a
                href={`#${cat.id}`}
                className="inline-flex items-center rounded-full border border-slate-800 bg-[#0A1628] px-4 py-2 font-medium text-slate-300 transition-colors hover:border-[#2563EB]/40 hover:bg-[#0D1E38] hover:text-white"
              >
                {cat.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ============================================================
   FAQ LIST
   ============================================================ */
function FAQList() {
  return (
    <section
      aria-label="Frequently asked questions"
      className="border-b border-slate-800 bg-[#0A1628]"
    >
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="space-y-16">
          {CATEGORIES.map((cat) => (
            <section
              key={cat.id}
              id={cat.id}
              aria-labelledby={`${cat.id}-heading`}
              className="scroll-mt-24"
            >
              <RevealOnScroll>
                <div className="mb-6 border-b border-slate-800 pb-4">
                  <h2
                    id={`${cat.id}-heading`}
                    className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
                  >
                    {cat.title}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">{cat.blurb}</p>
                </div>
              </RevealOnScroll>

              <div className="space-y-3">
                {cat.items.map((qa, i) => (
                  <RevealOnScroll key={qa.question} delayMs={i * 40}>
                    <details className="group rounded-lg border border-slate-800 bg-[#070F1C] transition-colors open:border-slate-700 hover:border-slate-700">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1628]">
                        <span className="text-base font-medium text-white sm:text-lg">
                          {qa.question}
                        </span>
                        <ChevronDown
                          className="h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="border-t border-slate-800 px-5 pb-5 pt-4">
                        <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
                          {qa.answer}
                        </p>
                      </div>
                    </details>
                  </RevealOnScroll>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FINAL CTA
   ============================================================ */
function FinalCTA() {
  return (
    <section
      aria-labelledby="faq-cta-heading"
      className="bg-gradient-to-b from-[#0A1628] to-[#070F1C]"
    >
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
        <RevealOnScroll>
          <div className="text-center">
            <h2
              id="faq-cta-heading"
              className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl"
            >
              Still wondering whether this is for you?{" "}
              <span className="text-[#D4A843]">Try it.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              The discovery interview and your first recommendation are free.
              Twenty minutes from now, you&rsquo;ll know whether the answer
              feels right.
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
