'use client';
// src/components/institute/roadmap/TaskRow.tsx
//
// Institute task ledger row. Collapsed = status circle + title + sub +
// meta + caret; expanded = why / success / tool launchers / actions.
//
// All task behaviour (status transitions, completion moment, check-ins,
// diagnostic) is reused from the existing useTaskCheckIn hook + the
// existing interactive widgets — this is the Institute render shell
// over that machinery, not a new state machine. The reused widgets
// (CheckInForm, CheckInHistoryList, TaskDiagnosticChat,
// TaskCompletionMoment, TaskToolLaunchers) still carry the legacy
// palette inside the expanded panel (flagged for a later pass).

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';
import { buildTaskId } from '@/lib/roadmap/checkin-types';
import { useTaskCheckIn } from '@/app/(app)/discovery/roadmap/[id]/useTaskCheckIn';
import { CheckInForm } from '@/app/(app)/discovery/roadmap/[id]/CheckInForm';
import { CheckInHistoryList } from '@/app/(app)/discovery/roadmap/[id]/CheckInHistoryList';
import { TaskDiagnosticChat } from '@/app/(app)/discovery/roadmap/[id]/TaskDiagnosticChat';
import { TaskCompletionMoment } from '@/app/(app)/discovery/roadmap/[id]/TaskCompletionMoment';
import { TaskToolLaunchers } from '@/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers';
import {
  useRoadmapWritability,
  readOnlyMessage,
} from '@/app/(app)/discovery/roadmap/[id]/RoadmapWritabilityContext';

export interface TaskRowProps {
  task:        StoredRoadmapTask;
  index:       number;
  phaseNumber: number;
  roadmapId:   string;
  founderGoal: string | null;
  progress:    { totalTasks: number; completedTasks: number } | null;
  onOutcomePromptDue?: () => void;
}

export function TaskRow({
  task: initialTask,
  index,
  phaseNumber,
  roadmapId,
  founderGoal,
  progress,
  onOutcomePromptDue,
}: TaskRowProps) {
  const taskId = buildTaskId(phaseNumber, index);
  const ck = useTaskCheckIn({ roadmapId, taskId, initialTask, onOutcomePromptDue });
  const [open, setOpen] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const { writable, readOnlyReason } = useRoadmapWritability();
  const readOnlyTip = readOnlyMessage(readOnlyReason);

  const status = ck.status;
  const done = status === 'completed';
  const now = status === 'in_progress';
  const blocked = status === 'blocked';

  const checkInCount = ck.history.length;
  const lastCheckIn = checkInCount > 0 ? ck.history[checkInCount - 1] : null;
  // The blocked reason isn't a dedicated field — the founder logs it as
  // a 'blocked' check-in. Surface the most recent blocked entry's text.
  const blockedNote = blocked
    ? ck.history.filter((h) => h.category === 'blocked').at(-1)?.freeText ?? null
    : null;

  const subline = done
    ? 'Complete'
    : now
      ? 'In flight'
      : blocked
        ? `Blocked${blockedNote ? ` · ${truncate(blockedNote, 60)}` : ''}`
        : 'Queued';

  return (
    <div
      className={[
        'mb-2.5 border transition-colors',
        open ? 'border-accent' : 'border-rule hover:border-rule-strong',
      ].join(' ')}
      style={open ? { background: 'linear-gradient(180deg, rgba(255,90,60,0.04), transparent)' } : undefined}
    >
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 py-4 text-left sm:grid-cols-[50px_minmax(0,1fr)_auto] sm:gap-[18px] sm:px-[22px] sm:py-[18px]"
      >
        <StatusCircle done={done} now={now} blocked={blocked} />
        <div className="min-w-0">
          <div
            className={[
              'break-words text-[15px] font-medium sm:text-[16.5px]',
              done ? 'text-muted line-through decoration-muted-2' : 'text-fg',
            ].join(' ')}
          >
            {ck.task.title}
          </div>
          <div
            className={[
              'mt-1 font-mono text-[10px] tracking-[0.04em]',
              blocked ? 'text-amber' : 'text-muted',
            ].join(' ')}
          >
            {subline}
            {checkInCount > 0 && <span> · {checkInCount} check-in{checkInCount === 1 ? '' : 's'}</span>}
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 pl-10 font-mono text-[9px] uppercase tracking-[0.1em] text-muted sm:col-span-1 sm:justify-start sm:pl-0 sm:text-[10px] sm:tracking-[0.12em]">
          <span>
            Est. <span className="text-fg">{ck.task.timeEstimate}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform ${open ? 'rotate-180 text-accent' : ''}`}
          />
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="min-w-0 border-t border-rule bg-bg-2 px-3 py-5 sm:px-[22px] sm:pl-[90px]">
          {/* Why */}
          {ck.task.rationale && (
            <p className="mb-4 max-w-[560px] text-[14.5px] leading-[1.6] text-fg-2">
              <b className="font-medium text-fg">Why this task, now. </b>
              {ck.task.rationale}
            </p>
          )}

          {/* Success criterion */}
          {ck.task.successCriteria && (
            <div className="mb-[18px] border-l-2 border-success bg-bg px-[18px] py-3.5">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-success">
                Success criterion
              </div>
              <p className="text-[14px] leading-[1.55] text-fg-2">{ck.task.successCriteria}</p>
            </div>
          )}

          {/* Tool launchers — reused (links carry task context). */}
          <div className="mb-[18px]">
            <TaskToolLaunchers roadmapId={roadmapId} taskId={taskId} task={ck.task} />
          </div>

          {/* Completion moment (reused) — appears after mark-complete. */}
          {ck.showCompletionMoment && (
            <div className="mb-4">
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
            </div>
          )}

          {/* Check-in history (reused) */}
          {checkInCount > 0 && (
            <div className="mb-4">
              <CheckInHistoryList history={ck.history} />
            </div>
          )}

          {/* Check-in form (reused) */}
          {writable && ck.formOpen && (
            <div className="mb-4">
              <CheckInForm
                open={ck.formOpen}
                category={ck.category}
                freeText={ck.freeText}
                submitting={ck.submitting}
                error={ck.error}
                canSubmit={ck.canSubmit}
                placeholderOverride={ck.completionPath === 'writing' ? 'What happened when you did this? Did it match what you expected?' : null}
                onCategoryChange={ck.setCategory}
                onTextChange={ck.setFreeText}
                onSubmit={() => { void ck.handleSubmitCheckIn(); }}
                onCancel={ck.handleCancelForm}
              />
            </div>
          )}

          {/* Diagnostic chat (reused) */}
          <TaskDiagnosticChat
            roadmapId={roadmapId}
            taskId={taskId}
            open={diagnosticOpen}
            onClose={() => setDiagnosticOpen(false)}
          />

          {/* Actions */}
          {writable && (
            <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-4">
              {!done && (
                <button
                  type="button"
                  onClick={() => { void ck.handleStatusChange('completed'); }}
                  disabled={ck.pendingStatus}
                  title={readOnlyTip ?? undefined}
                  className="inline-flex items-center gap-3 bg-accent px-3.5 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-opacity disabled:opacity-50"
                >
                  Mark complete →
                </button>
              )}
              {!ck.formOpen && (
                <button
                  type="button"
                  onClick={() => ck.setFormOpen(true)}
                  className="inline-flex items-center gap-2 border border-rule-strong px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
                >
                  Check in
                </button>
              )}
              {!diagnosticOpen && (
                <button
                  type="button"
                  onClick={() => setDiagnosticOpen(true)}
                  className="inline-flex items-center gap-2 border border-rule-strong px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
                >
                  Get help with this task
                </button>
              )}
              {lastCheckIn && (
                <span className="ml-auto font-mono text-[10px] tracking-[0.04em] text-muted">
                  {checkInCount} check-in{checkInCount === 1 ? '' : 's'} · latest: &ldquo;{truncate(lastCheckIn.freeText, 40)}&rdquo;
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusCircle({ done, now, blocked }: { done: boolean; now: boolean; blocked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'flex size-[22px] items-center justify-center rounded-full border-[1.5px]',
        done ? 'border-accent bg-accent text-bg'
          : now ? 'border-accent'
            : blocked ? 'border-amber'
              : 'border-rule-strong',
      ].join(' ')}
    >
      {done && <span className="text-[12px] leading-none">✓</span>}
      {now && (
        <span className="size-2 animate-pulse rounded-full bg-accent" style={{ animationDuration: '1.6s' }} />
      )}
      {blocked && <span className="font-serif text-[13px] font-bold leading-none text-amber">!</span>}
    </span>
  );
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
