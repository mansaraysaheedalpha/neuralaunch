'use client';
// src/app/(app)/discovery/roadmap/[id]/PhaseRail.tsx

import { Check } from 'lucide-react';
import type { RoadmapPhase } from '@/lib/roadmap';

export interface PhaseRangeEntry {
  phase:     number;
  startWeek: number;
  endWeek:   number;
}

export interface PhaseRailProps {
  phases:        RoadmapPhase[];
  /** Cumulative week ranges per phase, computed in the parent so the
   *  rail entry can render WEEKS X-Y on its right side. */
  phaseRanges:   PhaseRangeEntry[];
  selectedPhase: number;
  activePhase:   number;
  onSelect:      (phase: number) => void;
}

/**
 * PhaseRail
 *
 * Sticky vertical tablist. Per the design-tool spec, each entry
 * carries:
 *   - Numbered badge (gold-tinted on the active in-flight phase,
 *     success on completed, slate on upcoming)
 *   - Phase title
 *   - Status mono line beneath the title:
 *       "1/3 in flight" (active phase, gold)
 *       "X/Y done"      (completed phase, success)
 *       "0/Y · upcoming" (not yet started, muted)
 *   - Right-side mono micro-row showing "WEEKS X-Y" — gives the
 *     founder a sense of where in the calendar this phase sits
 *     without scrolling
 *
 * Active entry surface gets a subtle gradient lift
 * (from-primary/[0.10] via-primary/[0.04] to-transparent) so the
 * "you are here" feels lit, not just bordered.
 *
 * Selection-vs-activity distinction:
 *   - "selected" = which phase's tasks are currently rendered to
 *     the right (controlled by user clicking)
 *   - "active"   = the founder's natural position (first incomplete
 *     phase) — only marked when the founder has clicked away to
 *     browse a different phase, via a tiny gold dot on the
 *     non-selected active row
 */
export function PhaseRail({
  phases,
  phaseRanges,
  selectedPhase,
  activePhase,
  onSelect,
}: PhaseRailProps) {
  const rangeFor = (phase: number) =>
    phaseRanges.find(r => r.phase === phase) ?? { startWeek: 0, endWeek: 0 };

  return (
    <nav
      role="tablist"
      aria-label="Phase navigation"
      aria-orientation="vertical"
      className="lg:sticky lg:top-32 lg:self-start lg:max-w-[220px] flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible snap-x lg:snap-none"
    >
      <p className="hidden lg:block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 px-3 mb-1">
        Phases
      </p>
      {phases.map((phase) => {
        const tasks      = phase.tasks as Array<{ status?: string }>;
        const completed  = tasks.filter(t => t.status === 'completed').length;
        const inProgress = tasks.filter(t => t.status === 'in_progress').length;
        const total      = tasks.length;
        const isComplete = total > 0 && completed === total;
        const isSelected = phase.phase === selectedPhase;
        const isCurrent  = phase.phase === activePhase && !isComplete;
        const isCurrentNotSelected = isCurrent && !isSelected;
        const range = rangeFor(phase.phase);

        // Status word follows the design-tool spec:
        //   completed phase → "X/Y done" (success)
        //   active phase    → "M/Y in flight" (gold) where M = in-progress count
        //   not-yet-started → "0/Y · upcoming" (muted)
        //   partial-but-not-current (rare) → "M/Y" (slate)
        const status = isComplete
          ? { text: `${completed}/${total} done`,             color: 'text-success' }
          : isCurrent
            ? { text: `${inProgress || completed}/${total} in flight`, color: 'text-gold' }
            : completed > 0
              ? { text: `${completed}/${total}`,              color: 'text-muted-foreground' }
              : { text: `0/${total} · upcoming`,              color: 'text-muted-foreground/70' };

        // SELECTED takes visual precedence on the surface chrome
        // (gradient lift + primary left rail). COMPLETED gets a
        // soft success tint. Active-but-not-selected gets the
        // small gold dot marker so the founder can find their way
        // back when browsing.
        const containerClass = isSelected
          ? 'bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent border-l-[3px] border-l-primary'
          : isComplete
            ? 'bg-success/[0.04] border-l-[3px] border-l-success/40 hover:bg-success/[0.07]'
            : 'bg-transparent border-l-[3px] border-l-transparent hover:bg-card/40';

        // Badge color follows the in-flight semantic: gold for the
        // active phase (matches the "in flight" gold status word),
        // success for completed, primary for selected-but-not-current,
        // slate for upcoming.
        const badgeClass = isComplete
          ? 'border border-success/30 bg-success/15 text-success'
          : isCurrent
            ? 'border border-gold/40 bg-gold/15 text-gold'
            : isSelected
              ? 'border border-primary/40 bg-primary/15 text-primary'
              : 'border border-border bg-card/60 text-muted-foreground';

        const titleClass = isSelected
          ? 'text-foreground font-semibold'
          : isComplete
            ? 'text-foreground/80 font-medium'
            : 'text-foreground/70 font-medium';

        return (
          <button
            key={phase.phase}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="phase-panel"
            id={`phase-tab-${phase.phase}`}
            onClick={() => onSelect(phase.phase)}
            className={`snap-start flex-shrink-0 lg:flex-shrink min-w-[220px] lg:min-w-0 flex items-start gap-2.5 rounded-md py-2.5 pl-3 pr-2.5 transition-colors text-left ${containerClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
          >
            <span
              className={`flex-shrink-0 size-7 rounded-md text-[11px] font-mono font-bold flex items-center justify-center ${badgeClass}`}
              aria-hidden="true"
            >
              {isComplete ? <Check className="size-3.5" /> : String(phase.phase).padStart(2, '0')}
            </span>
            <div className="flex flex-col min-w-0 flex-1 gap-0.5">
              <div className="flex items-center gap-1.5">
                <p className={`text-[13.5px] leading-tight truncate ${titleClass}`}>
                  {phase.title}
                </p>
                {isCurrentNotSelected && (
                  <span
                    className="size-1.5 rounded-full bg-gold flex-shrink-0"
                    aria-label="Your current phase"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-[10px] font-mono ${status.color}`}>
                  {status.text}
                </p>
                {/* WEEKS X-Y micro-row, only shown when we have a
                    valid range. Mono so the digits align across
                    rows. Gold for the active phase to mirror the
                    badge + status colour, muted otherwise. */}
                {range.endWeek > 0 && (
                  <p className={`text-[9.5px] font-mono uppercase tracking-wider ${isCurrent ? 'text-gold/80' : 'text-muted-foreground/55'}`}>
                    W{range.startWeek}{range.startWeek !== range.endWeek ? `-${range.endWeek}` : ''}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
