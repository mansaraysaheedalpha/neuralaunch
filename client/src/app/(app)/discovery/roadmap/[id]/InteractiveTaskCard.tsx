'use client';
// src/app/(app)/discovery/roadmap/[id]/InteractiveTaskCard.tsx

import { motion } from 'motion/react';
import { useState } from 'react';
import {
  buildTaskId,
  type StoredRoadmapTask,
  type TaskStatus,
} from '@/lib/roadmap/checkin-types';
import { CheckInForm }         from './CheckInForm';
import { CheckInHistoryList }  from './CheckInHistoryList';
import { TaskDiagnosticChat }  from './TaskDiagnosticChat';
import { TaskToolLaunchers }   from './TaskToolLaunchers';
import { TaskCompletionMoment } from './TaskCompletionMoment';
import { TaskMetadata }        from './TaskMetadata';
import { useTaskCheckIn }      from './useTaskCheckIn';

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed:   'Completed',
  blocked:     'Blocked',
};

const STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  completed:   'bg-green-500/10 text-green-600 dark:text-green-400',
  blocked:     'bg-red-500/10 text-red-600 dark:text-red-400',
};

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={[
        'rounded-lg border bg-card p-4 flex flex-col gap-3',
        ck.status === 'completed' ? 'border-green-500/30 opacity-90' :
        ck.status === 'blocked'   ? 'border-red-500/30' :
        'border-border',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={[
          'text-sm font-medium flex-1 break-words',
          ck.status === 'completed' ? 'text-foreground/70 line-through decoration-foreground/30' : 'text-foreground',
        ].join(' ')}>
          {ck.task.title}
        </p>
        <select
          value={ck.status}
          disabled={ck.pendingStatus}
          onChange={e => { void ck.handleStatusChange(e.target.value as TaskStatus); }}
          className={[
            'shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2 py-1 border-0 font-medium cursor-pointer outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50',
            STATUS_BADGE_CLASSES[ck.status],
          ].join(' ')}
        >
          {(['not_started', 'in_progress', 'completed', 'blocked'] as const).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => ck.setFormOpen(true)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Check in on this task →
          </button>
          {/* A6: task-level diagnostic — always visible, always active.
              Opens a focused diagnostic conversation about THIS specific
              task. Separate turn budget from the check-in system. */}
          <button
            type="button"
            onClick={() => setDiagnosticOpen(true)}
            className="text-[11px] text-primary/80 hover:text-primary underline underline-offset-2"
          >
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

      <TaskToolLaunchers roadmapId={roadmapId} taskId={taskId} task={ck.task} />
    </motion.div>
  );
}
