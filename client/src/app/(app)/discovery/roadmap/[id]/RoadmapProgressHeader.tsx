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
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-3 -mx-6 px-6 pt-2">
      <div className="flex items-center justify-between gap-4 text-caption">
        <span>
          {completedTasks} of {totalTasks} tasks
          {' · '}Phase {currentPhase} of {totalPhases}
          {remaining && !isDone && ` · ~${remaining} week${remaining !== 1 ? 's' : ''} remaining`}
          {blockedTasks > 0 && (
            <span className="text-destructive ml-1.5">· {blockedTasks} blocked</span>
          )}
        </span>
        <span className="text-muted-foreground/60 text-xs tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-slow ${isDone ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
