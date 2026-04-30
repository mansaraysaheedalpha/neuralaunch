'use client';
// src/app/(app)/discovery/roadmap/[id]/InteractiveTaskCard.tsx

import { motion } from 'motion/react';
import { useState } from 'react';
import { MessageCircle, LifeBuoy } from 'lucide-react';
import {
  buildTaskId,
  type StoredRoadmapTask,
} from '@/lib/roadmap/checkin-types';
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
 * InteractiveTaskCard — orchestrator for one roadmap task. Owns the
 * task layout (title, description, time/criteria badges, rationale,
 * resources) and delegates the rest to focused children:
 *
 *   - useTaskCheckIn hook        — status / history / form state +
 *                                  status-change, check-in, A12
 *                                  success-criteria-confirmed handlers
 *   - <TaskCompletionMoment />   — green-bordered acknowledgment +
 *                                  A12 two-option capture surface
 *   - <CheckInForm />            — capture surface
 *   - <CheckInHistoryList />     — transcript
 *   - <TaskDiagnosticChat />     — A6 diagnostic conversation
 *   - <TaskToolLaunchers />      — Coach / Composer / Research /
 *                                  Packager buttons + flows + reviews
 *
 * The check-in pipeline:
 *   1. Status change → PATCH /tasks/[id]/status → optimistic update
 *      → conditional auto-open of the check-in form (blocked or
 *      completed states open the form with the right category)
 *   2. Submit check-in → POST /tasks/[id]/checkin → append to history
 *      → conditional surface of flagged-fundamental escape hatch
 *   3. Concern 5 trigger #1 → server flag bubbles up via
 *      onOutcomePromptDue so the parent RoadmapView can render the
 *      outcome capture form at the bottom of the page.
 */
export interface InteractiveTaskCardProps {
  task:             StoredRoadmapTask;
  index:            number;
  phaseNumber:      number;
  roadmapId:        string;
  founderGoal:      string | null;
  /** Total + completed counts so the completion moment can show progress. */
  progress:         { totalTasks: number; completedTasks: number } | null;
  onOutcomePromptDue?: () => void;
}

export function InteractiveTaskCard({
  task: initialTask,
  index,
  phaseNumber,
  roadmapId,
  founderGoal,
  progress,
  onOutcomePromptDue,
}: InteractiveTaskCardProps) {
  const taskId = buildTaskId(phaseNumber, index);
  const ck = useTaskCheckIn({ roadmapId, taskId, initialTask, onOutcomePromptDue });
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const { writable, readOnlyReason } = useRoadmapWritability();
  const readOnlyTip = readOnlyMessage(readOnlyReason);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={[
        // Card chrome — subtle shadow + status-driven left-rail accent.
        // The left-rail communicates the task's lifecycle position at a
        // glance: primary (in progress = "you're on this right now"),
        // success (completed = "marked done"), red (blocked), slate
        // (not started). Replaces the prior border-only treatment which
        // gave every task the same weight.
        'rounded-lg border bg-card p-4 flex flex-col gap-3 transition-colors shadow-sm shadow-black/10',
        'border-l-[3px]',
        ck.status === 'completed'   ? 'border-success/30 border-l-success/60 opacity-90' :
        ck.status === 'blocked'     ? 'border-red-500/30 border-l-red-500' :
        ck.status === 'in_progress' ? 'border-primary/30 border-l-primary' :
                                      'border-border border-l-border',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={[
          'text-sm font-medium flex-1 break-words',
          ck.status === 'completed' ? 'text-foreground/70 line-through decoration-foreground/30' : 'text-foreground',
        ].join(' ')}>
          {ck.task.title}
        </p>
        <TaskStatusPicker
          status={ck.status}
          pending={ck.pendingStatus}
          disabled={!writable}
          disabledReason={readOnlyTip}
          onChange={(s) => { void ck.handleStatusChange(s); }}
        />
      </div>

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

      {/* Read-only ventures (paused/completed/archived) hide the
          check-in form, the diagnostic chat, and the action links
          entirely. The CheckInHistoryList above stays so the founder
          can review past entries. The top-level banner explains why
          the surfaces are missing — a per-task echo would be noise. */}
      {writable && (
        <>
          <CheckInForm
            open={ck.formOpen}
            category={ck.category}
            freeText={ck.freeText}
            submitting={ck.submitting}
            error={ck.error}
            canSubmit={ck.canSubmit}
            // A12: when the founder picked "Tell us how it went" from the
            // two-option completion surface, the placeholder asks for the
            // specific outcome rather than the generic per-category prompt.
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
            // Outlined chip buttons — were 11px underline links before,
            // which read as footnotes for what are actually the most-
            // used per-task affordances. Same pattern as the Reopen-
            // discussion button on the recommendation page redesign:
            // visible without dominating, icon + label, slate for the
            // neutral check-in, primary for the diagnostic lifeline.
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => ck.setFormOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
              >
                <MessageCircle className="size-3" aria-hidden="true" />
                Check in on this task
              </button>
              {/* A6: task-level diagnostic — always visible when
                  writable, always active. Opens a focused diagnostic
                  conversation about THIS specific task. Separate turn
                  budget from the check-in system. */}
              <button
                type="button"
                onClick={() => setDiagnosticOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary/90 hover:bg-primary/10 hover:border-primary/50 transition-colors"
              >
                <LifeBuoy className="size-3" aria-hidden="true" />
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
    </motion.div>
  );
}
