'use client';
// src/app/(app)/discovery/roadmap/[id]/CheckInHistoryList.tsx

import { Sparkles, Wrench, AlertTriangle, MessageSquare, ChevronDown } from 'lucide-react';
import type { CheckInEntry } from '@/lib/roadmap/checkin-types';

export interface CheckInHistoryListProps {
  history: CheckInEntry[];
}

/**
 * CheckInHistoryList — renders the per-task check-in transcript.
 *
 * Pure presentation. Each entry is a paired user-message + agent-
 * response card. The agent card may carry up to four optional
 * extension blocks emitted by the check-in agent:
 *   - proposedChanges (existing)         — adjusted_next_step
 *   - subSteps (Phase 2)                 — task breakdown
 *   - recommendedTools (Phase 2)         — tool recommendations
 *   - recalibrationOffer (Phase 2)       — soft "this might be the wrong direction"
 *
 * Each block is conditionally rendered when present. The component
 * stays presentation-only and is safe to share between scenarios.
 */
export function CheckInHistoryList({ history }: CheckInHistoryListProps) {
  if (history.length === 0) return null;
  return (
    // Collapsible bar — collapsed by default. Even one check-in is two
    // cards (founder turn + agent turn); five check-ins is ten cards
    // before any other affordance is reachable. The bar shows a count
    // badge so the founder can see at a glance "I have 3/5 check-ins
    // captured" without expanding. Native <details>/<summary> for
    // zero-JS keyboard accessibility — Space/Enter on the summary
    // toggles, screen readers announce "expanded" / "collapsed."
    <details className="group border border-rule bg-bg">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent">
        <div className="flex items-center gap-2.5">
          <MessageSquare aria-hidden="true" className="size-3.5 text-accent" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Check-in history
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted">
            {history.length} / 5
          </span>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span className="hidden sm:inline group-open:hidden">expand</span>
          <span className="hidden group-open:inline-flex">collapse</span>
          <ChevronDown aria-hidden="true" className="size-3.5 transition-transform duration-200 group-open:rotate-180" />
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-rule px-4 py-3">
      {history.map(entry => (
        <div key={entry.id} className="flex flex-col gap-1.5">
          {/* Founder turn — accent left rule + mono caps speaker stamp. */}
          <div className="border-l-2 border-accent bg-bg-2 px-3 py-2">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
              You · {entry.category}
            </p>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-fg">
              {entry.freeText}
            </p>
          </div>
          {/* Agent turn — neutral hairline; the adjusted_next_step turn
              (the "we're actually changing your roadmap" moment) bumps
              to accent left rule + accent eyebrow. */}
          <div className={[
            'border-l-2 bg-bg-2 px-3 py-2',
            entry.agentAction === 'adjusted_next_step'
              ? 'border-accent'
              : 'border-rule-strong',
          ].join(' ')}>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-2">
              NeuraLaunch · {entry.agentAction.replace(/_/g, ' ')}
            </p>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-fg">
              {entry.agentResponse}
            </p>

            {entry.proposedChanges && entry.proposedChanges.length > 0 && (
              <div className="mt-3 border-t border-rule pt-2">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                  Proposed adjustments
                </p>
                <ul className="flex flex-col gap-1.5">
                  {entry.proposedChanges.map((c, i) => (
                    <li key={i} className="text-[12.5px] text-fg-2">
                      <span className="font-medium text-fg">{c.taskTitle}:</span> {c.rationale}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  Read these and apply them by editing the relevant tasks above.
                </p>
              </div>
            )}

            {entry.subSteps && entry.subSteps.length > 0 && (
              <div className="mt-3 border-t border-rule pt-2">
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-2">
                  <Sparkles aria-hidden="true" className="size-3 text-accent" />
                  Break it down
                </p>
                <ol className="flex flex-col gap-1 list-decimal list-inside text-[12.5px] text-fg-2 marker:text-muted">
                  {entry.subSteps.map((step, i) => (
                    <li key={i} className="leading-snug">{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {entry.recommendedTools && entry.recommendedTools.length > 0 && (
              <div className="mt-3 border-t border-rule pt-2">
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-2">
                  <Wrench aria-hidden="true" className="size-3 text-accent" />
                  Tools that could help
                </p>
                <ul className="flex flex-col gap-1">
                  {entry.recommendedTools.map((tool, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-1.5 text-[12.5px] leading-snug text-fg-2">
                      <span className={[
                        'border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
                        tool.isInternal
                          ? 'border-accent/40 text-accent'
                          : 'border-rule text-fg-2',
                      ].join(' ')}>
                        {tool.isInternal ? 'NeuraLaunch · ' : ''}{tool.name}
                      </span>
                      <span className="text-fg-2">{tool.purpose}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {entry.recalibrationOffer && (
              <div className="mt-3 border-t border-rule pt-2">
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
                  <AlertTriangle aria-hidden="true" className="size-3" />
                  Possible direction concern
                </p>
                <p className="mb-1 text-[12.5px] leading-snug text-fg-2">
                  {entry.recalibrationOffer.reason}
                </p>
                <p className="text-[12.5px] leading-snug text-fg-2">
                  {entry.recalibrationOffer.framing}
                </p>
              </div>
            )}
          </div>
        </div>
      ))}
      </div>
    </details>
  );
}
