"use client";

import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { DOT_TONE, SPRING, type Tone } from "./shared";

type Verdict = { tone: Tone; label: string; body: string };

const VERDICTS: Verdict[] = [
  { tone: "success", label: "Defends", body: "When the objection is wrong." },
  { tone: "gold", label: "Refines", body: "When you have a real point." },
  { tone: "primary", label: "Replaces", body: "When the case is fully made." },
];

const HIGHLIGHTS: Record<
  number,
  { tone: Tone; label: string; bold?: boolean }
> = {
  4: { tone: "gold", label: "Soft re-frame if stalled" },
  10: { tone: "primary", label: "Execute cap — closing move", bold: true },
  15: { tone: "gold", label: "Compound cap — closing move", bold: true },
};

type DotMotionFn = (delay: number) => Record<string, unknown>;

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

  const dotMotion: DotMotionFn = (delay: number) =>
    reduce
      ? { initial: false, animate: { opacity: 1, scale: 1 } }
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

      <div className="my-5 h-px bg-gold/20" />

      {/* Tier legend — sits above the ladder so the meaning of the
          dual-tier accent is clear before the eye walks the ticks. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-5 rounded-sm bg-slate-600" />
          Execute &middot; 10 rounds
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-5 rounded-sm bg-gold/70" />
          Compound &middot; 15 rounds
        </span>
      </div>

      <div className="mt-3 lg:hidden">
        <CompactMilestones />
      </div>

      <div className="mt-3 hidden lg:block">
        <FullLadder dotMotion={dotMotion} />
      </div>
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

const LADDER_HEIGHT_PX = 240;

function FullLadder({ dotMotion }: { dotMotion: DotMotionFn }) {
  const rounds = Array.from({ length: 15 }, (_, i) => i + 1);
  return (
    <div className="relative pl-6">
      <div
        className="absolute left-2 top-1 w-px bg-slate-700"
        style={{ height: `${LADDER_HEIGHT_PX}px` }}
      />
      <ul
        className="relative flex flex-col justify-between"
        style={{ height: `${LADDER_HEIGHT_PX}px` }}
      >
        {rounds.map((n) => {
          const highlight = HIGHLIGHTS[n];
          const compoundOnly = n > 10;
          const tickColor = compoundOnly ? "bg-slate-700" : "bg-slate-600";
          const compoundAccent = compoundOnly
            ? "before:absolute before:-left-2 before:top-1/2 before:h-px before:w-1.5 before:-translate-y-1/2 before:bg-gold/40"
            : "";
          const dotSize = highlight?.bold ? "h-2.5 w-2.5" : "h-2 w-2";
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
                    className={`${dotSize} shrink-0 rounded-full ${DOT_TONE[highlight.tone]} ${
                      highlight.bold && highlight.tone === "primary"
                        ? "ring-2 ring-primary/30"
                        : ""
                    } ${
                      highlight.bold && highlight.tone === "gold"
                        ? "ring-2 ring-gold/30"
                        : ""
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      highlight.tone === "gold" ? "text-gold" : "text-primary"
                    } ${highlight.bold ? "font-semibold" : ""}`}
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
