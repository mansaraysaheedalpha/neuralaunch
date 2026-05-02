'use client';
// src/app/(app)/discovery/roadmap/[id]/PhaseBlock.tsx

import { useState } from 'react';
import { motion } from 'motion/react';
import type { RoadmapPhase } from '@/lib/roadmap';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';
import { InteractiveTaskCard } from './InteractiveTaskCard';
import { extractHourUpperBound } from './time-budget-shortener';

export interface PhaseBlockProps {
  phase:            RoadmapPhase;
  index:            number;
  roadmapId:        string;
  founderGoal:      string | null;
  progress:         { totalTasks: number; completedTasks: number } | null;
  /** Cumulative week range for this phase, computed once in the
   *  parent. When provided, the header renders the WEEKS X-Y mono
   *  micro-row beneath the description. */
  weekRange?:       { startWeek: number; endWeek: number };
  /** True when this is the founder's current in-flight phase (first
   *  with at least one not-yet-completed task). Drives the per-phase
   *  ambient gradient lift + the gold "in progress" status word. */
  isCurrentPhase?:  boolean;
  onOutcomePromptDue?: () => void;
}

/**
 * PhaseBlock
 *
 * A single phase rendered as: numbered header + tightened metadata
 * cluster + accordion of InteractiveTaskCards. Owns the per-phase
 * "which task is expanded" state (only one at a time).
 *
 * Active-phase treatment per the design tool:
 *   - Block surface gets a soft gold→transparent ambient gradient
 *     so "you are working on this phase" feels lit, not just
 *     bordered. Inactive phases stay flat.
 *   - Header right cluster shows "M/Y complete · In progress" in
 *     mono — gold for in-progress, success for fully-done.
 *   - WEEKS X-Y · NH BUDGET mono micro-row beneath the duration.
 *     Hour budget is the sum of upper-bound parsed hours across the
 *     phase's tasks; rendered only when at least one task parsed
 *     cleanly so we never lie a number into existence.
 */
export function PhaseBlock({
  phase,
  index,
  roadmapId,
  founderGoal,
  progress,
  weekRange,
  isCurrentPhase = false,
  onOutcomePromptDue,
}: PhaseBlockProps) {
  const tasks = phase.tasks as StoredRoadmapTask[];
  const defaultExpanded = tasks.findIndex(t => t.status !== 'completed');
  const [expandedIndex, setExpandedIndex] = useState<number>(defaultExpanded);

  const handleToggle = (i: number) => {
    setExpandedIndex(prev => (prev === i ? -1 : i));
  };

  // Per-phase aggregates for the header cluster.
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount     = tasks.length;
  const isComplete     = totalCount > 0 && completedCount === totalCount;
  const hourBudget     = tasks
    .map(t => extractHourUpperBound(t.timeEstimate))
    .reduce((a, b) => a + b, 0);

  // Status word — mirrors the design tool spec:
  //   completed      → "X/Y complete · Done" (success)
  //   active phase   → "M/Y complete · In progress" (gold)
  //   upcoming       → "0/Y complete" (muted, no status word)
  const statusWord =
    isComplete       ? { count: `${completedCount}/${totalCount} complete`, label: 'Done',        color: 'text-success' }
    : isCurrentPhase ? { count: `${completedCount}/${totalCount} complete`, label: 'In progress', color: 'text-gold'    }
    :                  { count: `${completedCount}/${totalCount} complete`, label: null,          color: 'text-muted-foreground/70' };

  // Active-phase ambient lift — soft gold gradient across the block
  // surface so the workspace feels lit. Inactive phases stay flat.
  const ambientClass = isCurrentPhase
    ? 'bg-gradient-to-b from-gold/[0.04] via-transparent to-transparent rounded-xl px-4 -mx-4 py-3 -my-1'
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: 'easeOut' }}
      className={`flex flex-col gap-4 ${ambientClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          {/* Phase badge — mono with leading zero ("02"), gold-tinted
              square. Mono mirrors the rail badge so the same phase
              reads as the same phase across surfaces. */}
          <div className="flex-shrink-0 size-9 rounded-lg border border-gold/30 bg-gold/10 text-gold text-[13px] font-mono font-bold flex items-center justify-center">
            {String(phase.phase).padStart(2, '0')}
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-foreground tracking-tight">{phase.title}</h3>
            <p className="text-[13.5px] text-muted-foreground leading-[1.55]">{phase.objective}</p>
            {/* WEEKS X-Y · NH BUDGET mono micro-row — only renders
                when a week range is available. Hour budget is omitted
                from the row (not appended) when nothing parsed
                cleanly so the row never lies. */}
            {weekRange && weekRange.endWeek > 0 && (
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70 mt-1">
                Weeks {weekRange.startWeek}{weekRange.startWeek !== weekRange.endWeek ? `-${weekRange.endWeek}` : ''}
                {hourBudget > 0 && ` · ${hourBudget}H Budget`}
              </p>
            )}
          </div>
        </div>
        {/* Right-side mono status cluster — "M/Y complete" + status
            word. Stacks vertically and right-aligns so it sits as a
            metadata column opposite the header. */}
        {totalCount > 0 && (
          <div className="flex flex-col items-end gap-0.5 shrink-0 pt-1">
            <p className={`text-[11px] font-mono ${statusWord.color}`}>
              {statusWord.count}
            </p>
            {statusWord.label && (
              <p className={`text-[11px] font-mono ${statusWord.color}`}>
                {statusWord.label}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="ml-12 flex flex-col gap-2">
        {tasks.map((task, i) => (
          <InteractiveTaskCard
            key={i}
            task={task}
            index={i}
            phaseNumber={phase.phase}
            roadmapId={roadmapId}
            founderGoal={founderGoal}
            progress={progress}
            isExpanded={expandedIndex === i}
            onToggle={() => handleToggle(i)}
            onOutcomePromptDue={onOutcomePromptDue}
          />
        ))}
      </div>
    </motion.div>
  );
}
