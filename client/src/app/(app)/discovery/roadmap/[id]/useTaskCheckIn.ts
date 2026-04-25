'use client';
// src/app/(app)/discovery/roadmap/[id]/useTaskCheckIn.ts
//
// Hook owning per-task check-in state and the three server interactions:
//   1. PATCH /tasks/[id]/status        (status transitions)
//   2. POST  /tasks/[id]/checkin       (check-in form submit)
//   3. POST  /tasks/[id]/checkin       (A12 "It went as planned" path)
//
// Extracted from InteractiveTaskCard so the orchestrator stays under
// the 200-line component cap. The hook returns everything the parent
// needs to wire its JSX — handlers, state, and the derived canSubmit
// boolean — in a single object.

import { useState } from 'react';
import type {
  CheckInEntry,
  StoredRoadmapTask,
  TaskStatus,
} from '@/lib/roadmap/checkin-types';
import { isCompletionOutcomePending } from '@/lib/roadmap/checkin-types';
import type { CheckInCategory } from './CheckInForm';

export interface UseTaskCheckInInput {
  roadmapId:           string;
  taskId:              string;
  initialTask:         StoredRoadmapTask;
  onOutcomePromptDue?: () => void;
}

export interface UseTaskCheckInResult {
  // State
  task:                  StoredRoadmapTask;
  status:                TaskStatus;
  history:               CheckInEntry[];
  pendingStatus:         boolean;
  formOpen:              boolean;
  category:              CheckInCategory | null;
  freeText:              string;
  submitting:            boolean;
  error:                 string | null;
  showCompletionMoment:  boolean;
  completionPath:        'choice' | 'writing' | null;
  canSubmit:             boolean;

  // Setters needed by JSX
  setCategory: (c: CheckInCategory | null) => void;
  setFreeText: (s: string) => void;
  setFormOpen: (open: boolean) => void;
  setShowCompletionMoment: (open: boolean) => void;

  // Handlers
  handleStatusChange:            (next: TaskStatus) => Promise<void>;
  handleSubmitCheckIn:           () => Promise<void>;
  handleSuccessCriteriaConfirmed: () => Promise<void>;
  handleCancelForm:              () => void;
  handleChooseWriting:           () => void;
}

export function useTaskCheckIn(input: UseTaskCheckInInput): UseTaskCheckInResult {
  const { roadmapId, taskId, initialTask, onOutcomePromptDue } = input;

  const [task,    setTask]    = useState<StoredRoadmapTask>(initialTask);
  const [status,  setStatus]  = useState<TaskStatus>(initialTask.status ?? 'not_started');
  const [history, setHistory] = useState<CheckInEntry[]>(initialTask.checkInHistory ?? []);
  const [pendingStatus, setPendingStatus] = useState(false);
  const [formOpen,    setFormOpen]    = useState(false);
  const [category,    setCategory]    = useState<CheckInCategory | null>(null);
  const [freeText,    setFreeText]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  // Re-seed the completion surface on mount when the task is already
  // completed but has no outcome-era entry — otherwise a refresh
  // between toggling complete and resolving the two-option prompt
  // leaves the task forever without outcome data.
  const initialPending = isCompletionOutcomePending(initialTask);
  const [showCompletionMoment, setShowCompletionMoment] = useState(initialPending);
  const [completionPath, setCompletionPath] = useState<'choice' | 'writing' | null>(
    initialPending ? 'choice' : null,
  );

  // A12: when the founder chose the writing path on a completed task
  // they have explicitly opted into telling us what happened — an
  // empty submission would defeat the entire two-option flow. Other
  // categories still require text as before.
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
      // outcome surface. The form is NOT auto-opened until the founder
      // picks the writing path — A12 fix for the prior "completed
      // tasks may have zero outcome data" gap.
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

  function handleChooseWriting() {
    setCompletionPath('writing');
    setCategory('completed');
    setFormOpen(true);
  }

  return {
    task, status, history, pendingStatus, formOpen, category, freeText,
    submitting, error, showCompletionMoment, completionPath, canSubmit,
    setCategory, setFreeText, setFormOpen, setShowCompletionMoment,
    handleStatusChange, handleSubmitCheckIn, handleSuccessCriteriaConfirmed,
    handleCancelForm, handleChooseWriting,
  };
}
