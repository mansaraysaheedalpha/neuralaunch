'use client';
// src/app/(app)/discovery/roadmap/[id]/InteractiveTaskCard.tsx

import { useState } from 'react';
import Link from 'next/link';
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
  const [flaggedFundamental,  setFlaggedFundamental]  = useState(false);

  const canSubmit =
    category !== null
    && (category === 'completed' || freeText.trim().length > 0)
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
      // Completion gets the acknowledgment moment AND auto-opens the
      // check-in form with category preselected so the founder can
      // share notes about how it went.
      if (newStatus === 'completed') {
        setShowCompletionMoment(true);
        setCategory('completed');
        setFormOpen(true);
      }
    } finally {
      setPendingStatus(false);
    }
  }

  async function handleSubmitCheckIn() {
    if (!canSubmit || category === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/checkin`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ category, freeText: freeText.trim() || '(no notes)' }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not submit check-in. Please try again.');
        return;
      }
      const json = await res.json() as {
        entry:              CheckInEntry;
        flaggedFundamental: boolean;
      };
      setHistory(prev => [...prev, json.entry]);
      setFreeText('');
      // Keep the form open if there were proposed changes — the founder
      // needs to read them. Otherwise close it after a successful turn.
      if (!json.entry.proposedChanges?.length) setFormOpen(false);
      setCategory(null);
      if (json.flaggedFundamental) setFlaggedFundamental(true);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
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
          <button
            type="button"
            onClick={() => setShowCompletionMoment(false)}
            className="self-start text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      <CheckInHistoryList history={history} />

      {flaggedFundamental && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex flex-col gap-2">
          <p className="text-[11px] text-red-700 dark:text-red-400 font-medium">
            This blocker may be a sign the recommendation itself needs to change.
          </p>
          <p className="text-[11px] text-foreground/80 leading-relaxed">
            Open the recommendation and push back on it directly — the agent will reason about whether to refine or replace the path with this new evidence.
          </p>
          <Link
            href={`/discovery/recommendations/${recommendationId}`}
            className="self-start rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-red-700 transition-colors"
          >
            Re-examine the recommendation →
          </Link>
        </div>
      )}

      <CheckInForm
        open={formOpen}
        category={category}
        freeText={freeText}
        submitting={submitting}
        error={error}
        canSubmit={canSubmit}
        onCategoryChange={setCategory}
        onTextChange={setFreeText}
        onSubmit={() => { void handleSubmitCheckIn(); }}
        onCancel={handleCancelForm}
      />

      {!formOpen && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="self-start text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Check in on this task →
        </button>
      )}
    </motion.div>
  );
}
