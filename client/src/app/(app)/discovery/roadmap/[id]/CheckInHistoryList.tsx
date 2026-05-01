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
    <details className="group rounded-lg border border-border bg-card/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="size-3.5 text-gold" aria-hidden="true" />
          {/* CHECK-IN HISTORY eyebrow rendered in gold (was muted slate)
              to match the design tool spec. The check-in transcript is
              the founder's own voice on the task — gold framing reads
              as "this is something the system values," not just a log. */}
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
            Check-in history
          </span>
          <span className="inline-flex items-center rounded-full bg-gold/10 border border-gold/20 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gold/90">
            {history.length} / 5
          </span>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground/80">
          <span className="hidden sm:inline group-open:hidden">expand</span>
          <span className="hidden group-open:inline-flex">collapse</span>
          <ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-3 pt-2 border-t border-border">
      {history.map(entry => (
        <div key={entry.id} className="flex flex-col gap-1.5">
          {/* Founder turn — primary left-rail accent + faint primary tint
              so the chat reads as conversation, not a debugging log.
              Same role-tinting pattern as the WhatsNextPanel diagnostic. */}
          <div className="rounded-lg border border-border bg-primary/[0.04] border-l-[3px] border-l-primary/50 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80 mb-1">
              You · {entry.category}
            </p>
            <p className="text-[11px] text-foreground/90 whitespace-pre-wrap break-words">
              {entry.freeText}
            </p>
          </div>
          {/* Agent turn — gold left-rail accent on the standard turn,
              brighter gold on the adjusted_next_step turn (the "I'm
              actually changing your roadmap" moment). The agent
              response now reads as a deliberate voice, not a slate
              utility card. */}
          <div className={[
            'rounded-lg border border-l-[3px] px-3 py-2',
            entry.agentAction === 'adjusted_next_step'
              ? 'border-gold/30 border-l-gold bg-gold/5'
              : 'border-border border-l-gold/40 bg-card/60',
          ].join(' ')}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gold/80 mb-1">
              NeuraLaunch · {entry.agentAction.replace(/_/g, ' ')}
            </p>
            <p className="text-[11px] text-foreground/90 whitespace-pre-wrap break-words">
              {entry.agentResponse}
            </p>

            {entry.proposedChanges && entry.proposedChanges.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gold/20">
                <p className="text-[10px] font-medium text-gold mb-1">
                  Proposed adjustments
                </p>
                <ul className="flex flex-col gap-1.5">
                  {entry.proposedChanges.map((c, i) => (
                    <li key={i} className="text-[11px] text-foreground/80">
                      <span className="font-medium">{c.taskTitle}:</span> {c.rationale}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] text-muted-foreground italic">
                  Read these and apply them by editing the relevant tasks above.
                </p>
              </div>
            )}

            {entry.subSteps && entry.subSteps.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/60">
                <p className="text-[10px] font-medium text-foreground/80 mb-1 flex items-center gap-1">
                  <Sparkles className="size-3" />
                  Break it down
                </p>
                <ol className="flex flex-col gap-1 list-decimal list-inside marker:text-muted-foreground/60">
                  {entry.subSteps.map((step, i) => (
                    <li key={i} className="text-[11px] text-foreground/85 leading-snug">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {entry.recommendedTools && entry.recommendedTools.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/60">
                <p className="text-[10px] font-medium text-foreground/80 mb-1 flex items-center gap-1">
                  <Wrench className="size-3" />
                  Tools that could help
                </p>
                <ul className="flex flex-col gap-1">
                  {entry.recommendedTools.map((tool, i) => (
                    <li key={i} className="text-[11px] text-foreground/85 leading-snug flex flex-wrap gap-1.5 items-baseline">
                      <span className={[
                        'rounded px-1.5 py-0.5 font-medium',
                        tool.isInternal
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-foreground/80',
                      ].join(' ')}>
                        {tool.isInternal ? 'NeuraLaunch · ' : ''}{tool.name}
                      </span>
                      <span className="text-foreground/70">{tool.purpose}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {entry.recalibrationOffer && (
              <div className="mt-2 pt-2 border-t border-orange-500/30">
                <p className="text-[10px] font-medium text-orange-700 dark:text-orange-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  Possible direction concern
                </p>
                <p className="text-[11px] text-foreground/85 leading-snug mb-1">
                  {entry.recalibrationOffer.reason}
                </p>
                <p className="text-[11px] text-foreground/85 leading-snug">
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
