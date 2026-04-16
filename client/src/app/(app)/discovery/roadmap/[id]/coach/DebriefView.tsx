'use client';
// src/app/(app)/discovery/roadmap/[id]/coach/DebriefView.tsx
//
// Renders the four-section debrief produced after role-play ends.
// Green-tinted "what went well", amber-tinted "what to watch for",
// and optional revised sections highlighted diff-style.

import { CheckCircle2, AlertTriangle, FileEdit } from 'lucide-react';
import type { Debrief } from '@/lib/roadmap/coach';

export interface DebriefViewProps {
  debrief: Debrief;
  onDone:  () => void;
}

/**
 * DebriefView
 *
 * Three-section debrief display. The revisedSections block is only
 * rendered when the debrief produced changes to the preparation package.
 * The "Done" button at the bottom calls `onDone` to advance to the
 * `done` stage in CoachFlow.
 */
export function DebriefView({ debrief, onDone }: DebriefViewProps) {
  const { whatWentWell, whatToWatchFor, revisedSections } = debrief;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
          Rehearsal debrief
        </p>

        {/* What went well */}
        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-3 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle2 className="size-3.5 text-success" />
            <p className="text-xs font-semibold text-success">
              What went well
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {whatWentWell.map((item, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="shrink-0 size-1.5 rounded-full bg-success mt-1.5" />
                <p className="text-[11px] text-foreground/90 leading-relaxed">{item}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* What to watch for */}
        <div className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-3 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="size-3.5 text-gold" />
            <p className="text-xs font-semibold text-gold">
              What to watch for
            </p>
          </div>
          <ul className="flex flex-col gap-1.5">
            {whatToWatchFor.map((item, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="shrink-0 size-1.5 rounded-full bg-gold mt-1.5" />
                <p className="text-[11px] text-foreground/90 leading-relaxed">{item}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Revised sections — only rendered when present */}
        {revisedSections && (revisedSections.openingScript ?? revisedSections.additionalObjection) && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <FileEdit className="size-3.5 text-blue-600 dark:text-blue-400" />
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                Revised from rehearsal
              </p>
            </div>

            {revisedSections.openingScript && (
              <div className="mb-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Updated opening script
                </p>
                <p className="text-[11px] text-foreground whitespace-pre-wrap rounded-md border border-blue-500/20 bg-background px-2.5 py-2 leading-relaxed">
                  {revisedSections.openingScript}
                </p>
              </div>
            )}

            {revisedSections.additionalObjection && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  New objection surfaced
                </p>
                <div className="rounded-md border border-blue-500/20 overflow-hidden">
                  <div className="px-2.5 py-2 bg-blue-500/10 border-b border-blue-500/20">
                    <p className="text-[11px] font-medium text-foreground/80 italic">
                      &ldquo;{revisedSections.additionalObjection.objection}&rdquo;
                    </p>
                  </div>
                  <div className="px-2.5 py-2 bg-background">
                    <p className="text-[11px] text-foreground leading-relaxed">
                      {revisedSections.additionalObjection.response}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Done
      </button>
    </div>
  );
}
