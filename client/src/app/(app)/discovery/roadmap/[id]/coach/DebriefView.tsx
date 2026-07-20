"use client";

import type { Debrief } from "@/lib/roadmap/coach";
import { DecisionFooter } from "@/components/institute/tools/DecisionFooter";

export interface DebriefViewProps {
  debrief: Debrief;
  onDone: () => void;
}

function DebriefList({
  label,
  marker,
  items,
}: {
  label: string;
  marker: string;
  items: string[];
}) {
  return (
    <section>
      <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        {label}
      </h3>
      <ul className="border border-rule-strong">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="grid gap-3 border-b border-rule px-5 py-4 last:border-b-0 sm:grid-cols-[24px_1fr]"
          >
            <span className="font-serif text-lg italic text-accent">
              {marker}
            </span>
            <p className="text-[13px] leading-relaxed text-fg-2">{item}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DebriefView({ debrief, onDone }: DebriefViewProps) {
  const revised = debrief.revisedSections;
  return (
    <section className="flex flex-col gap-8 px-6 py-8 sm:px-10">
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <span>04 · Rehearsal debrief</span>
        <span className="text-accent">Evidence updated</span>
      </div>
      <header>
        <h2 className="font-serif text-[27px] italic text-fg">
          What the rehearsal revealed.
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-2">
          Specific strengths to keep, risks to watch, and language that improved
          under pressure.
        </p>
      </header>
      <div className="grid gap-7 lg:grid-cols-2">
        <DebriefList
          label="Keep doing"
          marker="+"
          items={debrief.whatWentWell}
        />
        <DebriefList
          label="Watch under pressure"
          marker="!"
          items={debrief.whatToWatchFor}
        />
      </div>
      {revised && (revised.openingScript || revised.additionalObjection) && (
        <section className="border border-accent">
          <header className="border-b border-accent px-5 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
            Revised from rehearsal
          </header>
          {revised.openingScript && (
            <div className="border-b border-rule px-5 py-5">
              <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.12em] text-muted">
                Updated opening
              </p>
              <p className="whitespace-pre-wrap font-serif text-[18px] italic leading-relaxed text-fg">
                {revised.openingScript}
              </p>
            </div>
          )}
          {revised.additionalObjection && (
            <div className="grid md:grid-cols-2">
              <blockquote className="border-b border-rule bg-accent/[0.04] px-5 py-4 font-serif text-[16px] italic text-fg md:border-b-0 md:border-r">
                “{revised.additionalObjection.objection}”
              </blockquote>
              <p className="px-5 py-4 text-[13px] leading-relaxed text-fg-2">
                {revised.additionalObjection.response}
              </p>
            </div>
          )}
        </section>
      )}
      {debrief.readinessVerdict && (
        <DecisionFooter
          data={{
            label: `Readiness verdict · ${debrief.readinessVerdict.status.replaceAll("_", " ")}`,
            decision: debrief.readinessVerdict.summary,
            learned: debrief.readinessVerdict.evidence,
            next: {
              action: debrief.readinessVerdict.nextAction,
              successSignal: debrief.readinessVerdict.readyWhen.join("; "),
              timing: debrief.readinessVerdict.nextActionTiming,
            },
            saved:
              "The rehearsal transcript, debrief, revised language, and readiness verdict are saved to this Coach session.",
            reconsiderWhen: [
              `Primary risk: ${debrief.readinessVerdict.primaryRisk}`,
              ...debrief.readinessVerdict.reconsiderWhen,
            ],
          }}
        />
      )}
      <button
        type="button"
        onClick={onDone}
        className="self-start bg-accent px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-bg"
      >
        Finish session →
      </button>
    </section>
  );
}
