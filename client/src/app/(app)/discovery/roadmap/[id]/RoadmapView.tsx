'use client';
// src/app/(app)/discovery/roadmap/[id]/RoadmapView.tsx

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Target, Loader2 } from 'lucide-react';
import type { RoadmapPhase } from '@/lib/roadmap';
import {
  buildTaskId,
  type StoredRoadmapTask,
  type CheckInEntry,
  type TaskStatus,
} from '@/lib/roadmap/checkin-types';

interface RoadmapProgressData {
  totalTasks:     number;
  completedTasks: number;
  blockedTasks:   number;
  lastActivityAt: string;
  nudgePending:   boolean;
}

interface RoadmapData {
  id:             string;
  status:         'GENERATING' | 'READY' | 'FAILED' | 'STALE';
  phases:         RoadmapPhase[];
  closingThought: string | null;
  weeklyHours:    number | null;
  totalWeeks:     number | null;
  progress:       RoadmapProgressData | null;
}

type PollResponse = { status: 'not_started' } | RoadmapData;

/**
 * InteractiveTaskCard
 *
 * Interactive task surface with:
 *   - Status control (segmented dropdown: not_started / in_progress / completed / blocked)
 *   - Inline check-in form (category pills + free text)
 *   - Completion-acknowledgment moment when status becomes 'completed'
 *   - Inline expansion of the check-in form when status flips to 'blocked'
 *   - Per-task check-in transcript rendered above the form
 *   - Flagged-fundamental link out to the recommendation pushback flow
 *
 * The component owns its own optimistic state for the task fields and
 * the check-in transcript. The parent passes the task by value at
 * mount; subsequent updates are local until the next full poll.
 */
interface InteractiveTaskCardProps {
  task:             StoredRoadmapTask;
  index:            number;
  phaseNumber:      number;
  roadmapId:        string;
  recommendationId: string;
  founderGoal:      string | null;
  /** Total + completed counts so the completion moment can show progress. */
  progress:         { totalTasks: number; completedTasks: number } | null;
}

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

const CHECKIN_CATEGORY_LABELS = {
  completed:  'Completed ✓',
  blocked:    'Blocked',
  unexpected: 'Something unexpected',
  question:   'I have a question',
} as const;

const CHECKIN_PLACEHOLDERS = {
  completed:  'Anything worth noting about how it went?',
  blocked:    'What specifically is blocking you?',
  unexpected: 'What happened that you did not expect?',
  question:   'What do you want to know?',
} as const;

type CheckInCategoryLocal = keyof typeof CHECKIN_CATEGORY_LABELS;

function InteractiveTaskCard({
  task: initialTask,
  index,
  phaseNumber,
  roadmapId,
  recommendationId,
  founderGoal,
  progress,
}: InteractiveTaskCardProps) {
  const taskId = buildTaskId(phaseNumber, index);

  const [task,    setTask]    = useState<StoredRoadmapTask>(initialTask);
  const [status,  setStatus]  = useState<TaskStatus>(initialTask.status ?? 'not_started');
  const [history, setHistory] = useState<CheckInEntry[]>(initialTask.checkInHistory ?? []);
  const [pendingStatus, setPendingStatus] = useState(false);

  // Check-in form state
  const [formOpen,    setFormOpen]    = useState(false);
  const [category,    setCategory]    = useState<CheckInCategoryLocal | null>(null);
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
      const json = await res.json() as { task: StoredRoadmapTask | null };
      setStatus(newStatus);
      if (json.task) setTask(json.task);

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

  // Completion moment: shown briefly inline, then dismissable
  const completionLine = (() => {
    if (!showCompletionMoment) return null;
    const total = progress?.totalTasks ?? 0;
    const done  = progress?.completedTasks ?? 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const goalLine = founderGoal
      ? `One step closer to your goal: ${truncate(founderGoal, 140)}.`
      : null;
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 flex flex-col gap-2"
      >
        <p className="text-xs font-medium text-green-700 dark:text-green-400">
          ✓ {task.title}
        </p>
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          You hit the success criteria: <span className="italic">{truncate(task.successCriteria, 200)}</span>.
        </p>
        {goalLine && (
          <p className="text-[11px] text-foreground/80 leading-relaxed">
            {goalLine}
          </p>
        )}
        {total > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {done} of {total} tasks complete · {pct}% through your roadmap
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
    );
  })();

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
        {/* Status control */}
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

      <p className="text-xs text-muted-foreground leading-relaxed break-words">
        {task.description}
      </p>

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

      {/* Completion acknowledgment moment */}
      {completionLine}

      {/* Per-task check-in transcript */}
      {history.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Check-in history ({history.length}/5)
          </p>
          {history.map(entry => (
            <div key={entry.id} className="flex flex-col gap-1.5">
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
                  You · {entry.category}
                </p>
                <p className="text-[11px] text-foreground/90 whitespace-pre-wrap break-words">
                  {entry.freeText}
                </p>
              </div>
              <div className={[
                'rounded-lg border px-3 py-2',
                entry.agentAction === 'flagged_fundamental' ? 'border-red-500/30 bg-red-500/5' :
                entry.agentAction === 'adjusted_next_step'  ? 'border-amber-500/30 bg-amber-500/5' :
                'border-border bg-muted/40',
              ].join(' ')}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
                  NeuraLaunch · {entry.agentAction.replace(/_/g, ' ')}
                </p>
                <p className="text-[11px] text-foreground/90 whitespace-pre-wrap break-words">
                  {entry.agentResponse}
                </p>
                {entry.proposedChanges && entry.proposedChanges.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-amber-500/20">
                    <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 mb-1">
                      Proposed adjustments
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {entry.proposedChanges.map((c, i) => (
                        <li key={i} className="text-[11px] text-foreground/80">
                          <span className="font-medium">{c.taskTitle}:</span> {c.rationale}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[10px] text-muted-foreground italic">
                      Read these and apply them by editing the relevant tasks above.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flagged-fundamental escape hatch */}
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

      {/* Check-in form */}
      <AnimatePresence>
        {formOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                Check in on this task
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(CHECKIN_CATEGORY_LABELS) as CheckInCategoryLocal[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={[
                      'rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
                      category === c
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-foreground/30',
                    ].join(' ')}
                  >
                    {CHECKIN_CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
              <textarea
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                placeholder={category ? CHECKIN_PLACEHOLDERS[category] : 'Pick a category above…'}
                disabled={!category || submitting}
                rows={3}
                className="resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              {error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
              <div className="flex items-center gap-2 self-end">
                <button
                  type="button"
                  onClick={() => { setFormOpen(false); setError(null); setCategory(null); setFreeText(''); }}
                  disabled={submitting}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSubmitCheckIn(); }}
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {submitting && <Loader2 className="size-3 animate-spin" />}
                  {submitting ? 'Sending…' : 'Submit check-in'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "Check in" call-to-action when the form is closed */}
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + '…';
}

/**
 * Walk the phases in order and return the first task whose status is
 * 'in_progress'. Used by the proactive nudge banner to name what the
 * founder was working on. Tasks default to 'not_started' when the
 * status field is absent — meaning generated-but-not-yet-touched
 * tasks never trip this.
 */
function findFirstInProgressTask(phases: RoadmapPhase[]): { title: string } | null {
  for (const phase of phases) {
    for (const task of phase.tasks) {
      const status = (task as StoredRoadmapTask).status;
      if (status === 'in_progress') return { title: task.title };
    }
  }
  return null;
}

interface PhaseBlockProps {
  phase:            RoadmapPhase;
  index:            number;
  roadmapId:        string;
  recommendationId: string;
  founderGoal:      string | null;
  progress:         { totalTasks: number; completedTasks: number } | null;
}

function PhaseBlock({
  phase,
  index,
  roadmapId,
  recommendationId,
  founderGoal,
  progress,
}: PhaseBlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 size-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
          {phase.phase}
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{phase.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{phase.objective}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            {phase.durationWeeks} week{phase.durationWeeks !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div className="ml-10 flex flex-col gap-2">
        {phase.tasks.map((task, i) => (
          <InteractiveTaskCard
            key={i}
            task={task as StoredRoadmapTask}
            index={i}
            phaseNumber={phase.phase}
            roadmapId={roadmapId}
            recommendationId={recommendationId}
            founderGoal={founderGoal}
            progress={progress}
          />
        ))}
      </div>
    </motion.div>
  );
}

/**
 * RoadmapView
 *
 * Client Component — polls /api/discovery/recommendations/[id]/roadmap every 3s
 * while the roadmap is generating, then renders the full phased plan.
 *
 * Concern 4 wiring: each task card is interactive (status control,
 * check-in form, completion moment, flagged-fundamental escape hatch).
 * The optional founderGoal is quoted into the completion moment so
 * acknowledgments feel grounded in the founder's own purpose. The
 * proactive nudge banner reads from data.progress.nudgePending and
 * surfaces a one-click jump back into the active task.
 */
export function RoadmapView({
  recommendationId,
  founderGoal,
}: {
  recommendationId: string;
  founderGoal:      string | null;
}) {
  const [data, setData]     = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed]  = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let pollTimeout:    ReturnType<typeof setTimeout>;
    const deadline =    Date.now() + 3 * 60 * 1000; // 3-minute hard stop
    let cancelled  =    false;

    async function poll() {
      if (cancelled) return;
      if (Date.now() >= deadline) { setFailed(true); setLoading(false); return; }

      try {
        const res = await fetch(`/api/discovery/recommendations/${recommendationId}/roadmap`);
        if (!res.ok) { setFailed(true); setLoading(false); return; }

        const json = await res.json() as PollResponse;

        if (json.status === 'not_started' || json.status === 'GENERATING') {
          pollTimeout = setTimeout(() => { void poll(); }, 3000);
        } else if (json.status === 'READY' || json.status === 'STALE') {
          // STALE roadmaps are still rendered — the founder can read
          // them — but the banner offers regeneration. The data is
          // structurally identical to READY.
          setData(json);
          setLoading(false);
        } else {
          // FAILED or unknown
          setFailed(true);
          setLoading(false);
        }
      } catch {
        setFailed(true);
        setLoading(false);
      }
    }

    void poll();
    return () => { cancelled = true; clearTimeout(pollTimeout); };
  }, [recommendationId]);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/discovery/recommendations/${recommendationId}/roadmap`, {
        method: 'POST',
      });
      if (!res.ok) {
        setRegenerating(false);
        return;
      }
      // Reset to loading state and re-poll. The POST upserts status
      // back to GENERATING, so the next poll cycle will pick that up.
      setData(null);
      setLoading(true);
      setRegenerating(false);
      // Force a fresh effect run by toggling the deps via a small
      // re-mount trick: update a counter. Simpler: just call poll
      // directly via a microtask. We use the existing useEffect by
      // bumping a dep — but since we don't have one here, just kick
      // off a one-shot fetch loop.
      const reloadDeadline = Date.now() + 3 * 60 * 1000;
      const reloadPoll = async () => {
        if (Date.now() >= reloadDeadline) { setFailed(true); setLoading(false); return; }
        try {
          const r = await fetch(`/api/discovery/recommendations/${recommendationId}/roadmap`);
          if (!r.ok) { setFailed(true); setLoading(false); return; }
          const j = await r.json() as PollResponse;
          if (j.status === 'not_started' || j.status === 'GENERATING') {
            setTimeout(() => { void reloadPoll(); }, 3000);
          } else if (j.status === 'READY' || j.status === 'STALE') {
            setData(j);
            setLoading(false);
          } else {
            setFailed(true);
            setLoading(false);
          }
        } catch {
          setFailed(true);
          setLoading(false);
        }
      };
      void reloadPoll();
    } finally {
      // setRegenerating(false) handled in branches above
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Building your execution roadmap…</p>
        <p className="text-xs text-muted-foreground/60">This takes about 20–30 seconds</p>
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="text-sm text-muted-foreground">Something went wrong generating your roadmap.</p>
        <p className="text-xs text-muted-foreground/60">Please try again from your recommendation page.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto px-6 py-10">

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Your Execution Roadmap</h1>
        {data.totalWeeks && data.weeklyHours && (
          <p className="text-sm text-muted-foreground">
            {data.totalWeeks} week{data.totalWeeks !== 1 ? 's' : ''} · {data.weeklyHours} hours/week
          </p>
        )}
      </motion.div>

      {/* Proactive nudge banner — set by the daily Inngest sweep when
          an in-progress task has gone stale. The founder always sees
          this above any STALE banner because the urgency order is:
          (1) you have an open task that needs an update,
          (2) the recommendation changed underneath you. */}
      {data.progress?.nudgePending && (() => {
        const inProgressTask = findFirstInProgressTask(data.phases);
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex flex-col gap-2"
          >
            <p className="text-[10px] uppercase tracking-widest text-primary/70">
              Quick check-in
            </p>
            <p className="text-xs text-foreground leading-relaxed">
              {inProgressTask
                ? `You were working on "${inProgressTask.title}". How did it go?`
                : 'You have not updated your roadmap in a while. How is it going?'}
            </p>
            {inProgressTask && (
              <p className="text-[11px] text-muted-foreground">
                Tap any task below to share an update or report a blocker.
              </p>
            )}
          </motion.div>
        );
      })()}

      {data.status === 'STALE' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex flex-col gap-3"
        >
          <div>
            <p className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">
              Out of date
            </p>
            <p className="text-xs text-foreground leading-relaxed">
              Your recommendation was updated through pushback after this roadmap was generated.
              The steps below reflect the older version. Regenerate to get a roadmap that matches
              your current recommendation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void handleRegenerate(); }}
            disabled={regenerating}
            className="self-start flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {regenerating ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {regenerating ? 'Regenerating…' : 'Regenerate roadmap'}
          </button>
        </motion.div>
      )}

      <div className="flex flex-col gap-10">
        {data.phases.map((phase, i) => (
          <PhaseBlock
            key={phase.phase}
            phase={phase}
            index={i}
            roadmapId={data.id}
            recommendationId={recommendationId}
            founderGoal={founderGoal}
            progress={data.progress
              ? { totalTasks: data.progress.totalTasks, completedTasks: data.progress.completedTasks }
              : null}
          />
        ))}
      </div>

      {data.closingThought && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: data.phases.length * 0.1 + 0.2 }}
          className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70 mb-2">Your Next Move</p>
          <p className="text-sm text-foreground leading-relaxed">{data.closingThought}</p>
        </motion.div>
      )}

    </div>
  );
}
