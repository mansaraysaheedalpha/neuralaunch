'use client';
// src/app/(app)/discovery/roadmap/[id]/InteractiveTaskCard.tsx

import { useState } from 'react';
import { motion } from 'motion/react';
import { Clock, Target } from 'lucide-react';
import {
  buildTaskId,
  type StoredRoadmapTask,
  type CheckInEntry,
  type TaskStatus,
} from '@/lib/roadmap/checkin-types';
import { CheckInForm, type CheckInCategory } from './CheckInForm';
import { CheckInHistoryList } from './CheckInHistoryList';
import { TaskDiagnosticChat } from './TaskDiagnosticChat';

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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + '…';
}

/**
 * InteractiveTaskCard
 *
 * Owns local optimistic state for one roadmap task — status, history,
 * and the check-in form. Renders three child surfaces: the
 * CheckInHistoryList (transcript), the CheckInForm (capture), and the
 * inline completion-acknowledgment moment when the task flips to
 * completed.
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
  recommendationId: string;
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
  recommendationId,
  founderGoal,
  progress,
  onOutcomePromptDue,
}: InteractiveTaskCardProps) {
  const taskId = buildTaskId(phaseNumber, index);

  const [task,    setTask]    = useState<StoredRoadmapTask>(initialTask);
  const [status,  setStatus]  = useState<TaskStatus>(initialTask.status ?? 'not_started');
  const [history, setHistory] = useState<CheckInEntry[]>(initialTask.checkInHistory ?? []);
  const [pendingStatus, setPendingStatus] = useState(false);

  // Check-in form state
  const [formOpen,    setFormOpen]    = useState(false);
  const [category,    setCategory]    = useState<CheckInCategory | null>(null);
  const [freeText,    setFreeText]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [showCompletionMoment, setShowCompletionMoment] = useState(false);
  // A12: two-option completion flow state. When the founder flips
  // status to completed, the card shows two buttons inside the
  // completion moment instead of auto-opening the check-in form:
  //   - "Tell us how it went" → opens the writing path (form open,
  //     category=completed, source='founder' on submit)
  //   - "It went as planned" → fires the success-criteria-confirmed
  //     submission directly (no form, freeText=successCriteria,
  //     source='success_criteria_confirmed')
  // 'choice' renders the buttons; 'writing' is set after the founder
  // picks "Tell us how it went" and the form opens; null is the
  // resting state for non-completed transitions.
  const [completionPath, setCompletionPath] = useState<'choice' | 'writing' | null>(null);
  // A6: task-level diagnostic chat toggle
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  // A12: when the founder chose the writing path on a completed
  // task they have explicitly opted into telling us what happened —
  // an empty submission would defeat the entire two-option flow.
  // The "completed without text" loophole only existed in the old
  // optional-text era and is gone now. Other categories still
  // require text as before.
  const canSubmit =
    category !== null
    && freeText.trim().length > 0
    && !submitting;

  async function handleStatusChange(newStatus: TaskStatus) {
    if (newStatus === status) return;
    setPendingStatus(true);
    setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        setError('Could not update status. Please try again.');
        return;
      }
      const json = await res.json() as {
        task: StoredRoadmapTask | null;
        outcomePromptDue?: boolean;
      };
      setStatus(newStatus);
      if (json.task) setTask(json.task);
      if (json.outcomePromptDue) onOutcomePromptDue?.();

      // The blocked state is the highest-urgency moment in the
      // post-roadmap experience. Open the check-in form immediately
      // with the category preselected so the founder cannot disengage.
      if (newStatus === 'blocked') {
        setCategory('blocked');
        setFormOpen(true);
      }
      // Completion shows the acknowledgment moment plus the two-option
      // outcome surface. The founder picks either "Tell us how it
      // went" (opens the text input) or "It went as planned" (fires
      // a success-criteria-confirmed submission directly). The form
      // is NOT auto-opened until the founder picks the writing path
      // — this is the A12 fix for the prior "completed tasks may
      // have zero outcome data" gap.
      if (newStatus === 'completed') {
        setShowCompletionMoment(true);
        setCompletionPath('choice');
      }
    } finally {
      setPendingStatus(false);
    }
  }

  // Shared low-level POST: lets both the regular form submit and the
  // A12 "It went as planned" path go through one code path so the
  // optimistic state updates and error handling stay consistent.
  async function postCheckIn(payload: {
    category: CheckInCategory;
    freeText: string;
    source?:  'founder' | 'success_criteria_confirmed';
  }) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/checkin`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not submit check-in. Please try again.');
        return;
      }
      const json = await res.json() as {
        entry:         CheckInEntry;
        recalibration: { route: 'pushback' | 'task_diagnostic'; reason: string } | null;
      };
      setHistory(prev => [...prev, json.entry]);
      setFreeText('');
      // Keep the form open if there were proposed changes — the founder
      // needs to read them. Otherwise close it after a successful turn.
      if (!json.entry.proposedChanges?.length) setFormOpen(false);
      setCategory(null);
      // A12: clear the completion-path UI on success so the two-option
      // surface does not linger after the founder has resolved it.
      setCompletionPath(null);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitCheckIn() {
    if (!canSubmit || category === null) return;
    await postCheckIn({
      category,
      freeText: freeText.trim() || '(no notes)',
      // A12: the writing path always carries the founder's own words
      // so the source is explicitly 'founder'. The default on the
      // route is also 'founder', but being explicit here removes
      // ambiguity for future readers.
      source:   completionPath === 'writing' ? 'founder' : undefined,
    });
  }

  // A12: "It went as planned" path. Submits the task's success
  // criteria as the freeText with source='success_criteria_confirmed'
  // so every completed task always carries outcome data, even when
  // the founder does not type a reflection.
  async function handleSuccessCriteriaConfirmed() {
    await postCheckIn({
      category: 'completed',
      freeText: task.successCriteria,
      source:   'success_criteria_confirmed',
    });
  }

  function handleCancelForm() {
    setFormOpen(false);
    setError(null);
    setCategory(null);
    setFreeText('');
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={[
        'rounded-lg border bg-card p-4 flex flex-col gap-3',
        status === 'completed' ? 'border-green-500/30 opacity-90' :
        status === 'blocked'   ? 'border-red-500/30' :
        'border-border',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={[
          'text-sm font-medium flex-1 break-words',
          status === 'completed' ? 'text-foreground/70 line-through decoration-foreground/30' : 'text-foreground',
        ].join(' ')}>
          {task.title}
        </p>
        <select
          value={status}
          disabled={pendingStatus}
          onChange={e => { void handleStatusChange(e.target.value as TaskStatus); }}
          className={[
            'shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2 py-1 border-0 font-medium cursor-pointer outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50',
            STATUS_BADGE_CLASSES[status],
          ].join(' ')}
        >
          {(['not_started', 'in_progress', 'completed', 'blocked'] as const).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed break-words">{task.description}</p>

      <div className="flex flex-wrap gap-3 mt-1">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" />{task.timeEstimate}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Target className="size-3" />{task.successCriteria}
        </span>
      </div>

      {task.rationale && (
        <p className="text-[11px] text-primary/70 italic border-t border-border pt-2 mt-1">
          {task.rationale}
        </p>
      )}

      {task.resources && task.resources.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.resources.map((r, i) => (
            <span key={i} className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
              {r}
            </span>
          ))}
        </div>
      )}

      {showCompletionMoment && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 flex flex-col gap-2"
        >
          <p className="text-xs font-medium text-green-700 dark:text-green-400">✓ {task.title}</p>
          <p className="text-[11px] text-foreground/80 leading-relaxed">
            You hit the success criteria: <span className="italic">{truncate(task.successCriteria, 200)}</span>.
          </p>
          {founderGoal && (
            <p className="text-[11px] text-foreground/80 leading-relaxed">
              One step closer to your goal: {truncate(founderGoal, 140)}.
            </p>
          )}
          {progress && progress.totalTasks > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {progress.completedTasks} of {progress.totalTasks} tasks complete · {Math.round((progress.completedTasks / progress.totalTasks) * 100)}% through your roadmap
            </p>
          )}

          {/* A12: two-option outcome capture. Renders only while
              completionPath === 'choice'. Picking either button moves
              the founder forward — there is no path that leaves the
              completed task with zero outcome data. */}
          {completionPath === 'choice' && (
            <div className="flex flex-col gap-2 pt-1">
              <p className="text-[11px] text-foreground/90 font-medium">
                How did this task actually go?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setCompletionPath('writing');
                    setCategory('completed');
                    setFormOpen(true);
                  }}
                  className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Tell us how it went
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => { void handleSuccessCriteriaConfirmed(); }}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  It went as planned
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Skipping means the outcome matched the success criteria exactly.
              </p>
            </div>
          )}

          {completionPath === null && (
            <button
              type="button"
              onClick={() => setShowCompletionMoment(false)}
              className="self-start text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              Dismiss
            </button>
          )}
        </motion.div>
      )}

      <CheckInHistoryList history={history} />

      <CheckInForm
        open={formOpen}
        category={category}
        freeText={freeText}
        submitting={submitting}
        error={error}
        canSubmit={canSubmit}
        // A12: when the founder picked "Tell us how it went" from
        // the two-option completion surface, the placeholder asks
        // for the specific outcome rather than the generic
        // per-category prompt.
        placeholderOverride={
          completionPath === 'writing'
            ? 'What happened when you did this? Did it match what you expected?'
            : null
        }
        onCategoryChange={setCategory}
        onTextChange={setFreeText}
        onSubmit={() => { void handleSubmitCheckIn(); }}
        onCancel={handleCancelForm}
      />

      {!formOpen && !diagnosticOpen && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
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
    </motion.div>
  );
}
