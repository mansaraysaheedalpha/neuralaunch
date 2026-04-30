'use client';
// src/app/(app)/discovery/roadmap/[id]/RoadmapProgressHeader.tsx

interface RoadmapProgressHeaderProps {
  totalTasks:     number;
  completedTasks: number;
  blockedTasks:   number;
  totalPhases:    number;
  currentPhase:   number;
  totalWeeks:     number | null;
}

/**
 * RoadmapProgressHeader — sticky at-a-glance progress bar at the top
 * of the roadmap view. Shows task counts, phase position, approximate
 * remaining time, and a thin progress bar.
 */
export function RoadmapProgressHeader({
  totalTasks,
  completedTasks,
  blockedTasks,
  totalPhases,
  currentPhase,
  totalWeeks,
}: RoadmapProgressHeaderProps) {
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const isDone = pct === 100;

  const remaining = totalWeeks && totalTasks > 0
    ? Math.max(1, Math.round(totalWeeks * (1 - completedTasks / totalTasks)))
    : null;

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-3 -mx-6 px-6 pt-3">
      <div className="flex items-end justify-between gap-4">
        <span className="text-caption leading-relaxed">
          {completedTasks} of {totalTasks} tasks
          {' · '}Phase {currentPhase} of {totalPhases}
          {remaining && !isDone && ` · ~${remaining} week${remaining !== 1 ? 's' : ''} remaining`}
          {blockedTasks > 0 && (
            <span className="text-destructive ml-1.5">· {blockedTasks} blocked</span>
          )}
        </span>
        {/* Percentage promoted to a real focal number — was text-xs in
            the muted-foreground/60 corner before. The most-glanced
            metric on this page deserves the most weight. Switches to
            success-green at 100% so the completion moment is felt. */}
        <span className={`text-2xl font-semibold tabular-nums leading-none ${isDone ? 'text-success' : 'text-primary'}`}>
          {pct}%
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        {/* Gradient progress fill — primary → gold → success matches
            the tier-unlock visual language on the marketing pricing
            stepper. The gradient is FIXED across the bar (not scaled
            with width) so as the founder progresses, the visible
            colour at their position naturally shifts from primary
            (early phases) toward success (late phases) without
            requiring any per-state branching. At 100% the bar fills
            entirely and the eye sees the success-green endcap. */}
        <div
          className={`h-full rounded-full transition-all duration-slow ${isDone ? 'bg-success' : 'bg-gradient-to-r from-primary via-gold to-success'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
