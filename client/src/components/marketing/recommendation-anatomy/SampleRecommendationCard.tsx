"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Check,
  Clock,
  Compass,
  Shield,
  X,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { RING, SPRING, STAGGER_S, type Tone } from "./shared";

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
    <div role="presentation" aria-hidden="true" className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-0 hidden xl:block"
      >
        <div className="absolute right-[-148px] top-[44px] flex items-center">
          <span className="h-px w-28 border-t border-dashed border-slate-700" />
          <span className="ml-2 text-[11px] font-medium text-gold">
            &larr; one direction
          </span>
        </div>
        <div className="absolute right-[-156px] top-[44%] flex items-center">
          <span className="h-px w-28 border-t border-dashed border-slate-700" />
          <span className="ml-2 text-[11px] font-medium text-gold">
            &larr; falsification
          </span>
        </div>
        <div className="absolute right-[-156px] top-[68%] flex items-center">
          <span className="h-px w-28 border-t border-dashed border-slate-700" />
          <span className="ml-2 text-[11px] font-medium text-slate-400">
            &larr; rejected paths
          </span>
        </div>
      </div>

      <motion.div
        {...cardMotion}
        className="relative z-10 overflow-hidden rounded-2xl border border-l-[3px] border-gold/30 border-l-gold bg-gradient-to-br from-navy-800 to-navy-900 p-6 shadow-2xl shadow-navy-950/60 lg:p-8"
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
          Based on your weekly hours (8) and your existing supplier network in
          Freetown, the highest-leverage path is a productized sourcing service
          &mdash; not a software build. You can have your first paying client
          in two weeks.
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
