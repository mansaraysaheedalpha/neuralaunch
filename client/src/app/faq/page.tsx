import type { Metadata } from "next";
import {
  EditorialPage,
  SatelliteHero,
  SatelliteSection,
  SatelliteClosing,
  SatelliteFAQItem,
} from "@/components/marketing/satellite";

const FAQ_DESCRIPTION =
  "How NeuraLaunch works — the discovery interview, the one recommendation, the roadmap, the internal tools, the check-ins, and the continuation cycle.";

export const metadata: Metadata = {
  title: "Questions & Answers — NeuraLaunch",
  description: FAQ_DESCRIPTION,
  openGraph: {
    title: "Questions & Answers — NeuraLaunch",
    description: FAQ_DESCRIPTION,
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
const CATEGORIES: Category[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blurb: "What NeuraLaunch is, who itâ€™s for, and how a session begins.",
    items: [
      {
        question: "What is NeuraLaunch?",
        answer:
          "NeuraLaunch is a growth engine and execution partner. It interviews your situation, commits to one clear recommendation for your specific circumstances, generates an execution roadmap sized to the hours you actually have, and stays with you through the work â€” with a Conversation Coach, an Outreach Composer, a Research Tool, a Service Packager, a Validation Page builder, a check-in system, and a continuation brief that interprets what you learned at the end of each cycle.",
      },
      {
        question: "Who is NeuraLaunch built for?",
        answer:
          "Five kinds of people in particular: graduates with skills but no clear path; founders whose previous attempt stalled; established business owners looking to grow; aspiring builders with an idea but no execution route; and mid-journey professionals balancing a career with a side project. NeuraLaunch adapts its tone, question priority, and roadmap rules to each.",
      },
      {
        question: "How do I get started?",
        answer:
          "Sign in with Google or GitHub, click â€œStart Your Discovery,â€ and answer the questions the system asks. There is no form to fill in and no dashboard to configure. The first thing that happens is a conversation.",
      },
      {
        question: "Do I need to be technical to use it?",
        answer:
          "No. NeuraLaunch is built for everyone â€” graduates, shop owners, founders, professionals. The system meets you exactly where you are, and roadmaps for non-technical paths look entirely different from roadmaps for software paths. Technical ability is one of the things the interview asks about, and it shapes what gets recommended.",
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
          "Typically between five and fifteen questions, depending on how completely you answer. There is a hard ceiling at fifteen â€” beyond that, the system is required to commit to a recommendation rather than keep asking.",
      },
      {
        question: "What does it actually ask about?",
        answer:
          "Four areas: who you are (background, situation, what youâ€™ve already tried), what you want (the goal, what success looks like, the time horizon), the constraints (hours per week, budget, team size, technical ability, your geographic market), and your conviction (commitment level, biggest concern, why now, what genuinely drives you).",
      },
      {
        question: "Can I leave and come back later?",
        answer:
          "Yes. The active session is held in a 15-minute sliding window â€” every answer extends it. If you walk away for longer, the session is rehydrated from durable storage when you return, so every previous answer is still there.",
      },
      {
        question: "What if Iâ€™m stuck on a question?",
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
          "When someone is lost, more options is the opposite of helpful. A real recommendation requires the system to take a position. NeuraLaunch hands you one direction, with the reasoning, the risks, the assumptions, and the alternatives it considered and rejected â€” for your specific situation.",
      },
      {
        question: "What if I disagree with the recommendation?",
        answer:
          "You can push back. The cap depends on your tier â€” up to 10 rounds on Execute, up to 15 on Compound. The system will defend its position when it should, refine where your point is valid, and replace the recommendation entirely if you and the evidence together prove it wrong. At the cap, if the disagreement persists, it produces a closing move â€” a second alternative path built from the dominant thread of your pushback.",
      },
      {
        question: "Can I flag specific assumptions in the recommendation?",
        answer:
          "Yes. Every assumption the recommendation rests on can be flagged individually. Click the flag and the system tells you, in two or three sentences, exactly how the recommendation changes if that assumption turns out to be false.",
      },
      {
        question: "What happens when I accept it?",
        answer:
          "An execution roadmap is generated for that recommendation â€” phased, sequenced, sized to your stated weekly hours, with success criteria for every task. For software-product recommendations, you also get the option to generate a validation landing page.",
      },
    ],
  },
  {
    id: "roadmap",
    title: "The roadmap and the tools",
    blurb:
      "How execution actually works â€” task by task, with the AI alongside you.",
    items: [
      {
        question: "What does the roadmap look like?",
        answer:
          "Two to six phases, with up to five tasks per phase. Each task carries a description, a rationale, a realistic time estimate against your hours, and a success criterion you can actually check. Many tasks suggest a specific NeuraLaunch tool â€” Conversation Coach, Outreach Composer, Research Tool, Service Packager, or Validation Page â€” to use at the right moment.",
      },
      {
        question: "What does the Conversation Coach do?",
        answer:
          "It helps you rehearse a high-stakes conversation before you walk in. You tell it who youâ€™re talking to, your relationship to them, what you want, and what youâ€™re afraid of. It produces a preparation package â€” opening script, key asks, anticipated objections with grounded responses, fallback positions, and a post-conversation checklist. Then it role-plays the conversation with you, in character, without making it artificially easy.",
      },
      {
        question: "What does the Outreach Composer do?",
        answer:
          "It writes the messages you actually send. Single message, batch of five-to-ten variations, or a Day 1 / Day 5 / Day 14 follow-up sequence â€” for WhatsApp, email, or LinkedIn. Each message comes with a short note explaining why it works. If you donâ€™t like one, ask for a variation with a specific instruction and youâ€™ll get it.",
      },
      {
        question: "What does the Research Tool do?",
        answer:
          "It finds specific information about your market, your customers, your competitors, or your city. You ask in plain language. It shows you a research plan with an honest time estimate, then runs the research â€” typically a few minutes for deep questions. You get back structured findings with contact information, source URLs, and a confidence level (verified, likely, or unverified) on each.",
      },
      {
        question: "Can I use the tools without a roadmap?",
        answer:
          "Yes. The full toolkit â€” Conversation Coach, Outreach Composer, Research Tool, Service Packager, and Validation Page â€” is also available standalone from the Tools section in the sidebar, useful when you need one of them for something outside the current task.",
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
          "You can mark it done quietly, or check in â€” telling the system what happened (it went well, you got stuck, something unexpected came up, or you have a question). The check-in agent responds with specific, contextual guidance that knows where you are in the roadmap, what youâ€™ve tried before, and any tools youâ€™ve used.",
      },
      {
        question: "What if I get stuck on a single task?",
        answer:
          "Click â€œGet help with this taskâ€ on any task card. A focused diagnostic chat opens that knows that taskâ€™s context. It can break the task into sub-steps, suggest tools, walk you through specific blocks, or â€” if the problem is bigger than the task â€” escalate you to the â€œWhatâ€™s Next?â€ flow.",
      },
      {
        question: "What does â€œWhatâ€™s Next?â€ do?",
        answer:
          "It evaluates how far youâ€™ve gotten through the roadmap. If youâ€™ve completed most of it, it goes straight to generating a continuation brief. If youâ€™ve barely started or are stalled, it opens a short diagnostic conversation first to understand why, then moves to the brief.",
      },
      {
        question: "What is the continuation brief?",
        answer:
          "Five sections: what happened, what the system got wrong, what the evidence says, two or three concrete forks for what you could do next (each with a first move and the condition under which that fork would be the right one), and the parking lot of adjacent ideas you surfaced along the way. You pick a fork and the next cycle begins â€” auto-accepted, with speed calibration from what you actually did feeding into the new roadmap.",
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
          "Founders whose recommended path is a software product. From the recommendation hub, you can click â€œBuild Validation Pageâ€ to generate one. Service businesses, sales motions, and other recommendation types donâ€™t get a validation page â€” different paths need different proof.",
      },
      {
        question: "What goes on the page?",
        answer:
          "A clear value proposition shaped to your audience, an entry survey to capture why people arrived, an exit survey to capture why theyâ€™re leaving, feature cards drawn from your roadmap (so the features people click on are the features the market is confirming), and an email signup. Plus a distribution brief with three audience-specific channels you can post to.",
      },
      {
        question: "How do I know if itâ€™s working?",
        answer:
          "The system aggregates visitors, scroll depth, exit intent, signups, feature clicks, and survey responses. Every six hours it interprets the data. When enough signal accumulates â€” visitors, clicks, surveys â€” a build brief is produced telling you what the market confirmed, what it rejected, and what to build next. If the signal is negative, it says so plainly and offers pivot options grounded in the disconfirmed assumptions.",
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
          "The full discovery interview and your first recommendation are free. Paid tiers unlock the rest of the journey â€” execution roadmap, the three tools, check-ins, validation pages, and the continuation brief. Final pricing will reflect what founders at each tier actually get.",
      },
      {
        question: "Do I need to bring my own AI keys?",
        answer:
          "No. All AI services are included. You donâ€™t need an Anthropic, OpenAI, or research-provider account.",
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
          "Yes â€” and only if you choose to. After completing a roadmap, you can opt in to share an anonymised version of the outcome â€” with personal identifiers stripped and the geographic market reduced to country level â€” to help future founders. You can revoke at any time, and revocation removes the anonymised record from existing data, not just future submissions. The anonymised record also has a 24-month TTL so older outcomes age out automatically.",
      },
      {
        question: "Can I delete my data?",
        answer:
          "Yes. You can delete individual conversations from the sidebar. For full account deletion, contact support and weâ€™ll handle it.",
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
          "Use the feedback option inside the authenticated app to report it. Include what you were doing and what happened â€” the more specific, the faster we can fix it.",
      },
      {
        question: "Where can I learn more?",
        answer:
          "Read the About page for the conviction behind the product. Then start a discovery session â€” the best way to understand what NeuraLaunch is, is to use it.",
      },
    ],
  },
];


const ROMAN_LOWER = [
  "i.", "ii.", "iii.", "iv.", "v.", "vi.", "vii.", "viii.",
  "ix.", "x.", "xi.", "xii.", "xiii.", "xiv.", "xv.", "xvi.",
  "xvii.", "xviii.", "xix.", "xx.",
];

export default function FAQPage() {
  return (
    <EditorialPage>
      <SatelliteHero
        stamps={[
          { text: "NeuraLaunch / FAQ" },
          { text: "Short on purpose", live: true },
        ]}
        title={
          <>
            Questions we get<br />
            and the <em>honest answers.</em>
          </>
        }
        standfirst={
          <>
            <p>
              Everything below is a question founders have actually asked us — about the
              interview, the recommendation, the roadmap, the tools, the check-ins, and
              what happens at the end of a cycle. <strong>Short on purpose.</strong> If
              your question isn&rsquo;t here, the best answer is to <em>start a session</em>
              and ask the engine instead.
            </p>
            <p>
              The FAQ is organised by topic, in the order a founder usually encounters
              them. Every answer is the truth as we know it today; if our policy
              changes, this page changes the same day.
            </p>
          </>
        }
      />

      {CATEGORIES.map((cat, ci) => (
        <SatelliteSection
          key={cat.id}
          id={cat.id}
          num={ROMAN_UPPER[ci] ?? `${ci + 1}.`}
          stamp={cat.title}
          heading={<>{cat.blurb}</>}
        >
          <div aria-hidden="true" />
          <ol className="grid">
            {cat.items.map((qa, qi) => (
              <SatelliteFAQItem
                key={qa.question}
                roman={ROMAN_LOWER[qi] ?? `${qi + 1}.`}
                question={qa.question}
                answer={qa.answer}
              />
            ))}
          </ol>
        </SatelliteSection>
      ))}

      <SatelliteClosing
        heading={
          <>
            Still uncertain?<br />
            Talk to the <em>engine instead.</em>
          </>
        }
        body={
          <>
            The discovery interview and your first recommendation are free.{" "}
            <em>Twenty minutes</em> from now, you&rsquo;ll know whether the answer feels
            right.
          </>
        }
        cta={{ href: "/discovery", label: "Begin Discovery" }}
        quiet="Free to start · No card · ~12 minutes"
      />
    </EditorialPage>
  );
}

const ROMAN_UPPER = [
  "I.", "II.", "III.", "IV.", "V.", "VI.", "VII.", "VIII.",
  "IX.", "X.", "XI.", "XII.", "XIII.", "XIV.", "XV.",
];