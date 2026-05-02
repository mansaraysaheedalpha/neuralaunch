'use client';
// src/app/(app)/discovery/roadmap/[id]/InteractiveTaskCard.tsx

import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { MessageCircle, LifeBuoy, ChevronDown, MessageSquare, Check, Circle } from 'lucide-react';
import {
  buildTaskId,
  type StoredRoadmapTask,
  type CheckInEntry,
} from '@/lib/roadmap/checkin-types';
import { shortenTimeEstimate } from './time-budget-shortener';
import { CheckInForm }         from './CheckInForm';
import { CheckInHistoryList }  from './CheckInHistoryList';
import { TaskDiagnosticChat }  from './TaskDiagnosticChat';
import { TaskToolLaunchers }   from './TaskToolLaunchers';
import { TaskCompletionMoment } from './TaskCompletionMoment';
import { TaskMetadata }        from './TaskMetadata';
import { TaskStatusPicker }    from './TaskStatusPicker';
import { useTaskCheckIn }      from './useTaskCheckIn';
import {
  useRoadmapWritability,
  readOnlyMessage,
} from './RoadmapWritabilityContext';

/**
 * InteractiveTaskCard
 *
 * Two visual modes driven by parent-owned accordion state:
 *
 *   COLLAPSED (default for non-active tasks within a phase) —
 *     A compact h-14 row showing status indicator + title + time
 *     budget chip + check-in count + status pill + chevron. The
 *     entire row is clickable; clicking expands the card and
 *     collapses whichever sibling task was previously expanded.
 *
 *   EXPANDED (one task per phase at a time) —
 *     The full task surface: description + 2-column metadata strip
 *     (TIME BUDGET / DONE WHEN) + WHY THIS MATTERS gold callout +
 *     resource chips + collapsible CHECK-IN HISTORY bar + check-in
 *     form + diagnostic chat + OPEN WITH tool launcher row.
 *
 * The accordion state lives in PhaseBlock; this component is purely
 * driven by isExpanded + onToggle props. That keeps the per-phase
 * "only one open" invariant in one place and lets each card stay
 * stateless about siblings.
 */
export interface InteractiveTaskCardProps {
  task:             StoredRoadmapTask;
  index:            number;
  phaseNumber:      number;
  roadmapId:        string;
  founderGoal:      string | null;
  /** Total + completed counts so the completion moment can show progress. */
  progress:         { totalTasks: number; completedTasks: number } | null;
  /** Owned by parent (PhaseBlock) — only one task per phase is expanded. */
  isExpanded:       boolean;
  /** Click handler — parent flips the accordion. */
  onToggle:         () => void;
  onOutcomePromptDue?: () => void;
}

/** Compact status indicator dot — used in the collapsed row. */
function StatusDot({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success/20 text-success" aria-hidden="true">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary" aria-hidden="true">
        <span className="size-1.5 rounded-full bg-primary" />
      </span>
    );
  }
  if (status === 'blocked') {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-500" aria-hidden="true">
        <span className="size-1.5 rounded-full bg-red-500" />
      </span>
    );
  }
  return (
    <Circle className="size-5 shrink-0 text-muted-foreground/40" strokeWidth={1.5} aria-hidden="true" />
  );
}

export function InteractiveTaskCard({
  task: initialTask,
  index,
  phaseNumber,
  roadmapId,
  founderGoal,
  progress,
  isExpanded,
  onToggle,
  onOutcomePromptDue,
}: InteractiveTaskCardProps) {
  const taskId = buildTaskId(phaseNumber, index);
  const ck = useTaskCheckIn({ roadmapId, taskId, initialTask, onOutcomePromptDue });
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const { writable, readOnlyReason } = useRoadmapWritability();
  const readOnlyTip = readOnlyMessage(readOnlyReason);

  // Status-driven left-rail accent (primary for in-progress, success
  // for completed, red for blocked, slate otherwise) — preserved from
  // the prior redesign so the lifecycle position is felt at a glance
  // in BOTH collapsed and expanded states.
  const railClass =
    ck.status === 'completed'   ? 'border-success/30 border-l-success/60' :
    ck.status === 'blocked'     ? 'border-red-500/30 border-l-red-500'    :
    ck.status === 'in_progress' ? 'border-primary/30 border-l-primary'    :
                                  'border-border border-l-border';

  const checkInCount = (ck.history as CheckInEntry[]).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      // bg-navy-900 (deeper than shadcn's bg-card) matches the design
      // tool's task card surface — the card sits as a deeper navy plate
      // against the canvas, not a lighter raised card. Combined with
      // the page-level primary radial glow, the card reads as "the
      // work surface" rather than blending into the canvas.
      // min-w-0 propagates the shrink-allowance from the parent grid
      // track into this card and onward to the flex children below.
      className={`rounded-lg border bg-navy-900 border-l-[3px] shadow-sm shadow-black/10 transition-colors min-w-0 ${railClass}`}
    >
      {/* Collapsed row — always rendered as the row spine. The
          chevron rotates to communicate expand state. Clicking
          anywhere outside the status picker toggles the accordion. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-lg"
      >
        <StatusDot status={ck.status} />
        <p className={[
          // Title sized to design-tool spec: 13.5px / 500. Heavier
          // than body, lighter than the section h2 — the task title
          // is a row spine, not a heading. Was text-base font-semibold
          // before, which dominated the row visually.
          'flex-1 min-w-0 text-[13.5px] font-medium break-words',
          ck.status === 'completed' ? 'text-foreground/70 line-through decoration-foreground/30' : 'text-foreground',
        ].join(' ')}>
          {ck.task.title}
        </p>
        {/* Time pill — short mono form ("6-8h" / "1w" / "1 ev")
            instead of the full sentence. The full sentence stays
            in the TIME BUDGET cell of the expanded card. The prior
            full-string rendering was eating ~250px of horizontal
            real estate and forcing the task title to wrap. */}
        <span className="hidden sm:inline-flex items-center text-[10px] font-mono text-muted-foreground/90 tabular-nums shrink-0 rounded-full bg-muted px-2 py-0.5">
          {shortenTimeEstimate(ck.task.timeEstimate)}
        </span>
        {/* Check-in count — visible affordance so the founder can
            see "I have N check-ins on this task" without expanding. */}
        {checkInCount > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
            <MessageSquare className="size-3" aria-hidden="true" />
            {checkInCount}
          </span>
        )}
        {/* Status pill — kept on the row even when collapsed so the
            founder can change status without expanding. The picker
            stops click propagation internally so it doesn't trigger
            the accordion toggle. */}
        <span onClick={e => e.stopPropagation()} className="shrink-0">
          <TaskStatusPicker
            status={ck.status}
            pending={ck.pendingStatus}
            disabled={!writable}
            disabledReason={readOnlyTip}
            onChange={(s) => { void ck.handleStatusChange(s); }}
          />
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground/60 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Expanded surface — the full task panel. Lives inside an
          AnimatePresence so collapse/expand carries a felt motion
          transition, not a hard switch. */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 px-4 pb-4 pt-1 border-t border-border">
              <TaskMetadata task={ck.task} />

              {ck.showCompletionMoment && (
                <TaskCompletionMoment
                  taskTitle={ck.task.title}
                  successCriteria={ck.task.successCriteria}
                  founderGoal={founderGoal}
                  progress={progress}
                  completionPath={ck.completionPath}
                  submitting={ck.submitting}
                  onChooseWriting={ck.handleChooseWriting}
                  onChooseAsPlanned={() => { void ck.handleSuccessCriteriaConfirmed(); }}
                  onDismiss={() => ck.setShowCompletionMoment(false)}
                />
              )}

              <CheckInHistoryList history={ck.history} />

              {/* Read-only ventures hide the check-in form, the
                  diagnostic chat, and the action chips entirely. The
                  history above stays so the founder can review past
                  entries; the top-level banner explains why the
                  surfaces are missing. */}
              {writable && (
                <>
                  <CheckInForm
                    open={ck.formOpen}
                    category={ck.category}
                    freeText={ck.freeText}
                    submitting={ck.submitting}
                    error={ck.error}
                    canSubmit={ck.canSubmit}
                    placeholderOverride={
                      ck.completionPath === 'writing'
                        ? 'What happened when you did this? Did it match what you expected?'
                        : null
                    }
                    onCategoryChange={ck.setCategory}
                    onTextChange={ck.setFreeText}
                    onSubmit={() => { void ck.handleSubmitCheckIn(); }}
                    onCancel={ck.handleCancelForm}
                  />

                  {!ck.formOpen && !diagnosticOpen && (
                    // Action chips: per the design tool, label text is
                    // SLATE while the leading icon carries the tint.
                    // Primary-text-on-primary-tinted-background was
                    // collapsing into a single hue and reading as flat;
                    // separating the tint (icon + border) from the
                    // label (slate) keeps the chip readable AND keeps
                    // the diagnostic-lifeline visually distinct from
                    // the neutral check-in.
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => ck.setFormOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 py-1.5 text-[11px] font-medium text-foreground/80 hover:text-foreground hover:border-border/80 transition-colors"
                      >
                        <MessageCircle className="size-3 text-muted-foreground" aria-hidden="true" />
                        Check in on this task
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiagnosticOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] font-medium text-foreground/85 hover:bg-primary/10 hover:border-primary/50 hover:text-foreground transition-colors"
                      >
                        <LifeBuoy className="size-3 text-primary" aria-hidden="true" />
                        Get help with this task
                      </button>
                    </div>
                  )}

                  <TaskDiagnosticChat
                    roadmapId={roadmapId}
                    taskId={taskId}
                    open={diagnosticOpen}
                    onClose={() => setDiagnosticOpen(false)}
                  />
                </>
              )}

              <TaskToolLaunchers roadmapId={roadmapId} taskId={taskId} task={ck.task} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
