"use client";

// Pushback round counts (10 / 15 / soft-warn at 4) are a static mirror
// of PUSHBACK_CONFIG in packages/constants/src/discovery.ts. Verdict
// labels mirror PUSHBACK_ACTIONS in client/src/lib/discovery/pushback-engine.ts.
// If those constants change, update the visual here as well.

import {
  motion,
  useReducedMotion,
  type Transition,
} from "motion/react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Compass,
  Shield,
  X,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

const SPRING: Transition = { type: "spring", stiffness: 240, damping: 28 };
const STAGGER_S = 0.06;

type Tone = "success" | "gold" | "slate" | "primary";

const RING: Record<Tone, string> = {
  success: "bg-success/10 ring-success/30 text-success",
  gold: "bg-gold/10 ring-gold/30 text-gold",
  slate: "bg-slate-800 ring-slate-700 text-slate-300",
  primary: "bg-primary/10 ring-primary/30 text-primary",
};

type AnatomyBlock = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: Tone;
  field: string;
  label: string;
  body: string;
};

const BLOCKS: AnatomyBlock[] = [
  {
    icon: Check,
    tone: "success",
    field: "reasoning",
    label: "Reasoning",
    body: "Faster cash, lower upfront risk, and your supplier relationships are the moat.",
  },
  {
    icon: AlertTriangle,
    tone: "gold",
    field: "whatWouldMakeThisWrong",
    label: "What would make this wrong",
    body: "Service margin under 40%, or fewer than 3 of your contacts respond in week one.",
  },
  {
    icon: Shield,
    tone: "slate",
    field: "risks",
    label: "Risks",
    body: "Service businesses cap out at your hours. Plan the handoff to product by month four.",
  },
  {
    icon: X,
    tone: "slate",
    field: "alternativeRejected",
    label: "Alternative rejected",
    body: "Build MVP first — rejected because the validation cycle is 4-6 months, and you've already validated demand verbally.",
  },
];

export function SampleRecommendationCard() {
  const reduce = useReducedMotion();

  const cardMotion = reduce
    ? { initial: false as const, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-10%" },
        transition: SPRING,
      };

  const blockMotion = (i: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 8 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-10%" },
          transition: { ...SPRING, delay: 0.18 + i * STAGGER_S },
        };

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="relative"
    >
      {/* Annotation callouts — xl+ only, behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-0 hidden xl:block"
      >
        <div className="absolute right-[-148px] top-[44px] flex items-center">
          <span className="h-px w-28 border-t border-dashed border-slate-700" />
          <span className="ml-2 text-[11px] font-medium text-gold">
            ← one direction
          </span>
        </div>
        <div className="absolute right-[-156px] top-[44%] flex items-center">
          <span className="h-px w-28 border-t border-dashed border-slate-700" />
          <span className="ml-2 text-[11px] font-medium text-gold">
            ← falsification
          </span>
        </div>
        <div className="absolute right-[-156px] top-[68%] flex items-center">
          <span className="h-px w-28 border-t border-dashed border-slate-700" />
          <span className="ml-2 text-[11px] font-medium text-slate-400">
            ← rejected paths
          </span>
        </div>
      </div>

      <motion.div
        {...cardMotion}
        className="relative z-10 overflow-hidden rounded-2xl border border-gold/30 border-l-[3px] border-l-gold bg-gradient-to-br from-navy-800 to-navy-900 p-6 shadow-2xl shadow-navy-950/60 lg:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Recommendation
          </p>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
            build_service
          </span>
        </div>

        <h3 className="mt-3 text-xl font-semibold text-white">
          Pivot to validated services before code.
        </h3>

        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Based on your weekly hours (8) and your existing supplier network
          in Freetown, the highest-leverage path is a productized sourcing
          service — not a software build. You can have your first paying
          client in two weeks.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[11px] text-success">
            <Clock className="h-3 w-3" strokeWidth={2.5} />
            timeToFirstResult: 2 weeks
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
            <Compass className="h-3 w-3" strokeWidth={2.5} />
            firstThreeSteps: defined below
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BLOCKS.map((block, i) => {
            const Icon = block.icon;
            return (
              <motion.div
                key={block.field}
                {...blockMotion(i)}
                className="rounded-lg border border-slate-800 bg-navy-950/70 p-4"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${RING[block.tone]}`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {block.label}
                  </p>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
                  {block.body}
                </p>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-5">
          <span className="text-xs text-slate-400">Disagree?</span>
          <span
            role="presentation"
            className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs text-primary"
          >
            Push back &rarr;
          </span>
        </div>
      </motion.div>
    </div>
  );
}

type Verdict = { tone: Tone; label: string; body: string };

const VERDICTS: Verdict[] = [
  { tone: "success", label: "Defends", body: "When the objection is wrong." },
  { tone: "gold", label: "Refines", body: "When you have a real point." },
  { tone: "primary", label: "Replaces", body: "When the case is fully made." },
];

const DOT_TONE: Record<Tone, string> = {
  success: "bg-success",
  gold: "bg-gold",
  slate: "bg-slate-600",
  primary: "bg-primary",
};

export function PushbackLadder() {
  const reduce = useReducedMotion();

  const containerMotion = reduce
    ? { initial: false as const, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-10%" },
        transition: { ...SPRING, delay: 0.12 },
      };

  const dotMotion = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1, scale: 1 } }
      : {
          initial: { opacity: 0, scale: 0.6 },
          whileInView: { opacity: 1, scale: 1 },
          viewport: { once: true, margin: "-10%" },
          transition: { ...SPRING, delay },
        };

  return (
    <motion.div
      {...containerMotion}
      role="presentation"
      aria-hidden="true"
      className="flex h-full flex-col rounded-xl border border-slate-800 bg-navy-900 p-6 shadow-xl shadow-navy-950/50"
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        If you disagree
      </p>
      <h3 className="mt-1 text-base font-semibold text-white">
        It defends, refines, or replaces.
      </h3>

      <div className="mt-4 space-y-2.5">
        {VERDICTS.map((v) => (
          <div key={v.label} className="flex items-center gap-3">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONE[v.tone]}`}
            />
            <p className="text-sm text-white">
              {v.label}
              <span className="ml-2 text-slate-400">{v.body}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="my-6 h-px bg-gold/20" />

      {/* Compact horizontal milestones — visible at sm/md only */}
      <div className="lg:hidden">
        <CompactMilestones />
      </div>

      {/* Full vertical ladder — lg+ only */}
      <div className="hidden lg:block">
        <FullLadder dotMotion={dotMotion} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-5 rounded-sm bg-slate-600" />
          Execute &middot; 10 rounds
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-5 rounded-sm bg-gold/70" />
          Compound &middot; 15 rounds
        </span>
      </div>

      <p className="mt-4 text-xs italic leading-relaxed text-slate-400">
        When someone is lost, they don&rsquo;t need more options. They need
        someone willing to point at the way &mdash; and willing to change
        their mind when the case is made.
      </p>
    </motion.div>
  );
}

function CompactMilestones() {
  const chips = [
    { label: "Round 1", tone: "slate" as const },
    { label: "Round 4 · re-frame", tone: "gold" as const },
    { label: "Round 10 · Execute cap", tone: "primary" as const },
    { label: "Round 15 · Compound cap", tone: "gold" as const },
  ];
  const chipClass: Record<"slate" | "gold" | "primary", string> = {
    slate: "border-slate-700 text-slate-400",
    gold: "border-gold/40 text-gold",
    primary: "border-primary/40 text-primary",
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip, i) => (
        <div key={chip.label} className="flex items-center gap-1.5">
          <span
            className={`rounded-full border bg-navy-950 px-2.5 py-1 text-[10px] ${chipClass[chip.tone]}`}
          >
            {chip.label}
          </span>
          {i < chips.length - 1 && (
            <ChevronRight className="h-3 w-3 text-slate-600" />
          )}
        </div>
      ))}
    </div>
  );
}

type DotMotionFn = (delay: number) => Record<string, unknown>;

const HIGHLIGHTS: Record<
  number,
  { tone: Tone; label: string; bold?: boolean }
> = {
  4: { tone: "gold", label: "Soft re-frame if stalled" },
  10: { tone: "primary", label: "Execute cap — closing move", bold: true },
  15: { tone: "gold", label: "Compound cap — closing move", bold: true },
};

function FullLadder({ dotMotion }: { dotMotion: DotMotionFn }) {
  const rounds = Array.from({ length: 15 }, (_, i) => i + 1);
  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-1 h-[360px] w-px bg-slate-800" />
      <ul className="relative flex h-[360px] flex-col justify-between">
        {rounds.map((n) => {
          const highlight = HIGHLIGHTS[n];
          const compoundOnly = n > 10;
          const tickColor = compoundOnly ? "bg-slate-800" : "bg-slate-700";
          const compoundAccent = compoundOnly
            ? "before:absolute before:-left-2 before:top-1/2 before:h-px before:w-1.5 before:-translate-y-1/2 before:bg-gold/30"
            : "";
          return (
            <li
              key={n}
              className={`relative flex items-center gap-3 ${compoundAccent}`}
            >
              <span
                className={`absolute -left-[18px] h-px w-2.5 ${tickColor}`}
              />
              <span className="w-3 text-[10px] tabular-nums text-slate-500">
                {n}
              </span>
              {highlight && (
                <motion.span
                  {...dotMotion(0.3 + (n / 15) * 0.18)}
                  className="flex items-center gap-2"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONE[highlight.tone]} ${
                      highlight.bold ? "ring-2 ring-offset-0" : ""
                    } ${
                      highlight.bold && highlight.tone === "primary"
                        ? "ring-primary/30"
                        : ""
                    } ${
                      highlight.bold && highlight.tone === "gold"
                        ? "ring-gold/30"
                        : ""
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      highlight.tone === "gold" ? "text-gold" : "text-primary"
                    } ${highlight.bold ? "font-medium" : ""}`}
                  >
                    {highlight.label}
                  </span>
                </motion.span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
