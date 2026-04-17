'use client';
// src/app/(app)/discovery/roadmap/[id]/CheckInHistoryList.tsx

import { Sparkles, Wrench, AlertTriangle } from 'lucide-react';
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
    <div className="flex flex-col gap-2 pt-2 border-t border-border">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
        Check-in history ({history.length}/5)
      </p>
      {history.map(entry => (
        <div key={entry.id} className="flex flex-col gap-1.5">
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
              You · {entry.category}
            </p>
            <p className="text-[11px] text-foreground/90 whitespace-pre-wrap break-words">
              {entry.freeText}
            </p>
          </div>
          <div className={[
            'rounded-lg border px-3 py-2',
            entry.agentAction === 'adjusted_next_step' ? 'border-gold/30 bg-gold/5' :
            'border-border bg-muted/40',
          ].join(' ')}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
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
  );
}
