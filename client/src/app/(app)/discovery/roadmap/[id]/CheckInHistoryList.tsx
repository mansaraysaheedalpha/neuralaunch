'use client';
// src/app/(app)/discovery/roadmap/[id]/CheckInHistoryList.tsx

import type { CheckInEntry } from '@/lib/roadmap/checkin-types';

export interface CheckInHistoryListProps {
  history: CheckInEntry[];
}

/**
 * CheckInHistoryList — renders the per-task check-in transcript.
 *
 * Pure presentation. Each entry is a paired user-message + agent-
 * response card with a styled border indicating the agent action
 * (flagged_fundamental, adjusted_next_step, or default acknowledged).
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
            entry.agentAction === 'flagged_fundamental' ? 'border-red-500/30 bg-red-500/5' :
            entry.agentAction === 'adjusted_next_step'  ? 'border-amber-500/30 bg-amber-500/5' :
            'border-border bg-muted/40',
          ].join(' ')}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
              NeuraLaunch · {entry.agentAction.replace(/_/g, ' ')}
            </p>
            <p className="text-[11px] text-foreground/90 whitespace-pre-wrap break-words">
              {entry.agentResponse}
            </p>
            {entry.proposedChanges && entry.proposedChanges.length > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-500/20">
                <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 mb-1">
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
          </div>
        </div>
      ))}
    </div>
  );
}
