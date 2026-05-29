'use client';

import type { StoredRoadmapPhase } from '@/lib/roadmap/checkin-types';
import { TaskRow } from './TaskRow';

/**
 * PhaseBlock — one phase section in the task ledger. Huge italic-serif
 * roman numeral, phase name + objective sub-line, completion stamp,
 * then the task rows. Visual grammar: roadmap.html .phase.
 */
export interface PhaseBlockProps {
  phase:       StoredRoadmapPhase;
  romanIndex:  string;
  roadmapId:   string;
  founderGoal: string | null;
  progress:    { totalTasks: number; completedTasks: number } | null;
  weekRange?:  { startWeek: number; endWeek: number };
  onOutcomePromptDue?: () => void;
}

export function PhaseBlock({
  phase,
  romanIndex,
  roadmapId,
  founderGoal,
  progress,
  weekRange,
  onOutcomePromptDue,
}: PhaseBlockProps) {
  const total = phase.tasks.length;
  const done = phase.tasks.filter((t) => t.status === 'completed').length;
  const allDone = total > 0 && done === total;
  const weekLabel = weekRange
    ? weekRange.startWeek === weekRange.endWeek
      ? `Week ${weekRange.startWeek}`
      : `Weeks ${weekRange.startWeek}–${weekRange.endWeek}`
    : `${phase.durationWeeks ?? 1} week${(phase.durationWeeks ?? 1) === 1 ? '' : 's'}`;

  return (
    <section id={`phase-${phase.phase}`} className="mb-15">
      <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-baseline gap-6 border-b border-rule pb-[18px]">
        <div className="font-serif text-[48px] italic leading-[0.9] tracking-[-0.01em] text-accent">
          {romanIndex}.
        </div>
        <div>
          <h2 className="font-sans text-[30px] font-medium leading-[1.05] tracking-[-0.015em] text-fg">
            {phase.title}
          </h2>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {weekLabel} · {phase.objective ? truncate(phase.objective, 70) : `${total} tasks`}
          </div>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          <span className={allDone ? 'text-accent' : undefined}>
            {done} / {total} {allDone ? 'done' : total === 0 ? '' : '· current'}
          </span>
        </div>
      </div>

      <div>
        {phase.tasks.map((task, i) => (
          <TaskRow
            key={`${phase.phase}-${i}`}
            task={task}
            index={i}
            phaseNumber={phase.phase}
            roadmapId={roadmapId}
            founderGoal={founderGoal}
            progress={progress}
            onOutcomePromptDue={onOutcomePromptDue}
          />
        ))}
      </div>
    </section>
  );
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
