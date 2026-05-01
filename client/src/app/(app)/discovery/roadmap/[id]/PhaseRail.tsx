'use client';
// src/app/(app)/discovery/roadmap/[id]/PhaseRail.tsx

import { Check } from 'lucide-react';
import type { RoadmapPhase } from '@/lib/roadmap';

export interface PhaseRailProps {
  phases:         RoadmapPhase[];
  /** 1-indexed phase number currently displayed in the task panel.
   *  This is the user-controlled state — clicking a rail entry sets
   *  it and the parent re-renders the panel with that phase's tasks. */
  selectedPhase:  number;
  /** 1-indexed phase number considered the founder's "current"
   *  phase — first phase with at least one not-yet-completed task.
   *  Used to surface a small dot marker on the rail entry so the
   *  founder can see where they are even after they've clicked away
   *  to look at another phase. */
  activePhase:    number;
  /** Click handler — parent owns the selection state. */
  onSelect:       (phase: number) => void;
}

/**
 * PhaseRail
 *
 * Sticky vertical tablist on the left of the roadmap. Replaces the
 * prior stacked-everything-at-once pattern: now ONLY the selected
 * phase's tasks render in the right panel, so the work surface is
 * never cluttered by phases the founder isn't actively in. Clicking
 * a rail entry switches which phase's tasks are shown.
 *
 * Each rail entry shows:
 *   - Phase number in a tier-tinted square (success for completed,
 *     primary for selected, slate for inactive)
 *   - Short phase title
 *   - "X/Y done" mini-progress
 *   - A small primary dot when the entry is the founder's CURRENT
 *     phase (first incomplete) but NOT the selected one — preserves
 *     orientation when the founder is browsing other phases
 *
 * Tablist semantics: the rail is role="tablist", each entry is
 * role="tab" with aria-selected, and the parent's task panel is
 * role="tabpanel" linked via aria-controls / aria-labelledby. On
 * md and below, the rail collapses to a horizontal scroll-snap pill
 * row above the panel — same content, different orientation.
 */
export function PhaseRail({ phases, selectedPhase, activePhase, onSelect }: PhaseRailProps) {
  return (
    <nav
      role="tablist"
      aria-label="Phase navigation"
      aria-orientation="vertical"
      className="lg:sticky lg:top-32 lg:self-start lg:max-w-[200px] flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible snap-x lg:snap-none"
    >
      <p className="hidden lg:block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 px-3 mb-1">
        Phases
      </p>
      {phases.map((phase) => {
        const tasks      = phase.tasks as Array<{ status?: string }>;
        const completed  = tasks.filter(t => t.status === 'completed').length;
        const total      = tasks.length;
        const isComplete = total > 0 && completed === total;
        const isSelected = phase.phase === selectedPhase;
        const isCurrent  = phase.phase === activePhase && !isSelected && !isComplete;

        // SELECTED takes visual precedence — it's the phase whose
        // tasks are currently rendered to the right. COMPLETED gets
        // a soft success tint for informational reading. CURRENT
        // (the founder's actual position when they've clicked away)
        // gets a small gold dot marker. Otherwise neutral.
        const containerClass = isSelected
          ? 'bg-primary/[0.10] border-l-[3px] border-l-primary'
          : isComplete
            ? 'bg-success/[0.04] border-l-[3px] border-l-success/40 hover:bg-success/[0.07]'
            : 'bg-transparent border-l-[3px] border-l-transparent hover:bg-card/40';
        const badgeClass = isSelected
          ? 'border border-primary/40 bg-primary/15 text-primary'
          : isComplete
            ? 'border border-success/30 bg-success/15 text-success'
            : 'border border-border bg-card/60 text-muted-foreground';
        const titleClass = isSelected
          ? 'text-foreground font-semibold'
          : isComplete
            ? 'text-foreground/80'
            : 'text-foreground/70';

        return (
          <button
            key={phase.phase}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="phase-panel"
            id={`phase-tab-${phase.phase}`}
            onClick={() => onSelect(phase.phase)}
            className={`snap-start flex-shrink-0 lg:flex-shrink min-w-[200px] lg:min-w-0 flex items-start gap-2.5 rounded-md py-2 pl-3 pr-2 transition-colors text-left ${containerClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
          >
            <span
              className={`flex-shrink-0 size-7 rounded-md text-xs font-bold flex items-center justify-center ${badgeClass}`}
              aria-hidden="true"
            >
              {isComplete ? <Check className="size-3.5" /> : phase.phase}
            </span>
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={`text-sm leading-tight truncate ${titleClass}`}>
                  {phase.title}
                </p>
                {isCurrent && (
                  <span
                    className="size-1.5 rounded-full bg-gold flex-shrink-0"
                    aria-label="Your current phase"
                  />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {completed}/{total} done
              </p>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
