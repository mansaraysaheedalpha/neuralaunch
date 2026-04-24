'use client';
// src/app/(app)/discovery/roadmap/[id]/research/useResearchFlow.ts
//
// Custom hook encapsulating the Research Tool's server interaction
// logic. Extracted from ResearchFlow.tsx to keep the component
// under the 200-line cap.
//
// Post-Inngest-migration shape (2026-04-24): execute + followup are
// async — the route returns 202 with a jobId, the hook polls a
// status endpoint via useToolJob, and on terminal-stage 'complete'
// fetches the persisted session via the existing single-session GET
// to load the result. The 'executing' stage and the followUpLoading
// flag now both correlate with an in-flight ToolJob.

import { useState, useCallback, useEffect } from 'react';
import type { ResearchReport, ResearchFinding, ResearchSession } from '@/lib/roadmap/research-tool/schemas';
import { FOLLOWUP_MAX_ROUNDS } from '@/lib/roadmap/research-tool/constants';
import { useToolJob } from '@/lib/tool-jobs/use-tool-job';
import type { ToolJobStatus } from '@/lib/tool-jobs';

type Stage = 'query' | 'planning' | 'plan_review' | 'executing' | 'report';

export interface UseResearchFlowResult {
  stage:           Stage;
  query:           string;
  plan:            string;
  estimatedTime:   string;
  report:          ResearchReport | null;
  /**
   * Standalone research session id, populated after the plan returns
   * a sessionId. Used by Research → Packager cross-tool handoff so
   * the Packager link can reference this session for findings pre-load.
   * Null on the task-launched flow (the persisted session id lives on
   * task.researchSession.id; not surfaced through this hook).
   */
  sessionId:       string | null;
  followUps:       Array<{ query: string; findings: ResearchFinding[]; round: number }>;
  error:           string | null;
  followUpLoading: boolean;
  /** In-flight execute job (null when no job is running). Drives the
   *  ToolJobProgress ladder rendered while stage === 'executing'. */
  executeJob:      ToolJobStatus | null;
  /** In-flight follow-up job (null when no job is running). Drives the
   *  inline ladder shown beneath the existing report while a follow-up
   *  is still running. */
  followupJob:     ToolJobStatus | null;
  handleQuerySubmit: (q: string) => Promise<void>;
  handlePlanApprove: (editedPlan: string) => Promise<void>;
  handleFollowUp:    (q: string) => Promise<void>;
  /**
   * Load a previously-completed session back into the flow so the
   * founder can re-read the report (and ask further follow-ups). Used
   * by the standalone page's recent-research panel — no history UI on
   * the task-launched flow.
   */
  handleLoadSession: (sessionId: string) => Promise<void>;
  /**
   * Reset the flow back to the blank query stage. Used by the
   * standalone page's "New research" button after a session has been
   * loaded or completed.
   */
  resetToQuery:      () => void;
}

export function useResearchFlow(input: {
  roadmapId:  string;
  taskId:     string;
  standalone?: boolean;
  /**
   * Fired after every quota-consuming call finishes — success OR
   * error. The standalone page uses this to bump the UsageMeter's
   * refreshKey so the cycle-usage count updates immediately, rather
   * than forcing the founder to navigate away and back.
   */
  onToolCallComplete?: () => void;
}): UseResearchFlowResult {
  const { roadmapId, taskId, standalone, onToolCallComplete } = input;

  const [stage,        setStage]        = useState<Stage>('query');
  const [query,        setQuery]        = useState('');
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  const [plan,         setPlan]         = useState('');
  const [estimatedTime, setEstimatedTime] = useState('2–4 minutes');
  const [report,       setReport]       = useState<ResearchReport | null>(null);
  const [followUps,    setFollowUps]    = useState<Array<{ query: string; findings: ResearchFinding[]; round: number }>>([]);
  const [error,        setError]        = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [executeJobId,  setExecuteJobId]  = useState<string | null>(null);
  const [followupJobId, setFollowupJobId] = useState<string | null>(null);

  const planUrl     = standalone ? `/api/discovery/roadmaps/${roadmapId}/research/plan`     : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/plan`;
  const executeUrl  = standalone ? `/api/discovery/roadmaps/${roadmapId}/research/execute`  : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/execute`;
  const followupUrl = standalone ? `/api/discovery/roadmaps/${roadmapId}/research/followup` : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/followup`;
  const sessionUrl  = (sid: string) => `/api/discovery/roadmaps/${roadmapId}/research/sessions/${sid}`;

  // Polling hooks for the two long-running operations. Both hooks no-op
  // when their jobId is null (idle state).
  const { job: executeJob } = useToolJob({ jobId: executeJobId, roadmapId });
  const { job: followupJob } = useToolJob({ jobId: followupJobId, roadmapId });

  // When the execute job hits 'complete', fetch the session to load
  // the report into local state and transition the UI to 'report'.
  // 'failed' surfaces the error and bounces back to plan_review.
  useEffect(() => {
    if (!executeJob || !sessionId) return;
    if (executeJob.stage === 'complete') {
      void (async () => {
        try {
          const res = await fetch(sessionUrl(sessionId));
          if (res.ok) {
            const json = await res.json() as { session: ResearchSession };
            if (json.session.report) {
              setReport(json.session.report);
              setFollowUps(json.session.followUps ?? []);
              setStage('report');
            }
          }
        } catch { /* swallow — UI stays on executing, founder can refresh */ }
        setExecuteJobId(null);
        onToolCallComplete?.();
      })();
    } else if (executeJob.stage === 'failed') {
      setError(executeJob.errorMessage ?? 'Research execution failed.');
      setStage('plan_review');
      setExecuteJobId(null);
      onToolCallComplete?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executeJob?.stage, sessionId]);

  // Same shape for follow-up: refresh the whole session on complete so
  // the followUps array reflects the new round.
  useEffect(() => {
    if (!followupJob || !sessionId) return;
    if (followupJob.stage === 'complete') {
      void (async () => {
        try {
          const res = await fetch(sessionUrl(sessionId));
          if (res.ok) {
            const json = await res.json() as { session: ResearchSession };
            setFollowUps(json.session.followUps ?? []);
          }
        } catch { /* swallow */ }
        setFollowupJobId(null);
        setFollowUpLoading(false);
        onToolCallComplete?.();
      })();
    } else if (followupJob.stage === 'failed') {
      setError(followupJob.errorMessage ?? 'Follow-up failed.');
      setFollowupJobId(null);
      setFollowUpLoading(false);
      onToolCallComplete?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followupJob?.stage, sessionId]);

  const handleQuerySubmit = useCallback(async (submittedQuery: string) => {
    setQuery(submittedQuery);
    setStage('planning');
    setError(null);
    try {
      const res = await fetch(planUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: submittedQuery }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not generate research plan.');
        setStage('query');
        return;
      }
      const json = await res.json() as { plan: string; estimatedTime?: string; sessionId?: string };
      setPlan(json.plan);
      if (json.estimatedTime) setEstimatedTime(json.estimatedTime);
      if (json.sessionId) setSessionId(json.sessionId);
      setStage('plan_review');
    } catch {
      setError('Network error — please try again.');
      setStage('query');
    } finally {
      onToolCallComplete?.();
    }
  }, [planUrl, onToolCallComplete]);

  const handlePlanApprove = useCallback(async (editedPlan: string) => {
    setStage('executing');
    setError(null);
    try {
      const res = await fetch(executeUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: editedPlan,
          ...(standalone && sessionId ? { sessionId } : {}),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not queue research execution.');
        setStage('plan_review');
        onToolCallComplete?.();
        return;
      }
      // 202 — queued. The Inngest worker takes over from here. The
      // useToolJob effect above flips us to 'report' on completion
      // (or back to plan_review with an error message on failure).
      const json = await res.json() as { jobId: string; sessionId: string };
      setSessionId(json.sessionId);
      setExecuteJobId(json.jobId);
      // Note: do NOT call onToolCallComplete here — the meter bumps on
      // job completion via the effect above so the UsageMeter reflects
      // actual quota consumption (the route enforced quota on accept,
      // but the UX matches the perceived "work happened" moment).
    } catch {
      setError('Network error — please try again.');
      setStage('plan_review');
      onToolCallComplete?.();
    }
  }, [executeUrl, standalone, sessionId, onToolCallComplete]);

  const handleFollowUp = useCallback(async (followQuery: string) => {
    if (followUps.length >= FOLLOWUP_MAX_ROUNDS) return;
    setFollowUpLoading(true);
    setError(null);
    try {
      const res = await fetch(followupUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: followQuery,
          ...(standalone && sessionId ? { sessionId } : {}),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not queue follow-up.');
        setFollowUpLoading(false);
        onToolCallComplete?.();
        return;
      }
      // 202 — queued. The useToolJob effect above takes over from
      // here, refreshing followUps when the job completes.
      const json = await res.json() as { jobId: string; sessionId: string };
      if (!sessionId) setSessionId(json.sessionId);
      setFollowupJobId(json.jobId);
    } catch {
      setError('Network error — please try again.');
      setFollowUpLoading(false);
      onToolCallComplete?.();
    }
  }, [followupUrl, standalone, sessionId, followUps.length, onToolCallComplete]);

  const handleLoadSession = useCallback(async (sid: string) => {
    setError(null);
    setFollowUpLoading(false);
    try {
      const res = await fetch(sessionUrl(sid));
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not load that research session.');
        return;
      }
      const json = await res.json() as { session: ResearchSession };
      const s = json.session;
      setSessionId(s.id);
      setQuery(s.query);
      setPlan(s.plan ?? '');
      setReport(s.report ?? null);
      setFollowUps(s.followUps ?? []);
      // If the session has a report, jump to the report stage. If it
      // was abandoned at plan review, drop the founder back there.
      if (s.report)      setStage('report');
      else if (s.plan)   setStage('plan_review');
      else               setStage('query');
    } catch {
      setError('Network error — please try again.');
    }
  }, [roadmapId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetToQuery = useCallback(() => {
    setStage('query');
    setQuery('');
    setPlan('');
    setReport(null);
    setFollowUps([]);
    setSessionId(null);
    setError(null);
  }, []);

  return {
    stage, query, plan, estimatedTime, report, sessionId, followUps,
    error, followUpLoading,
    executeJob, followupJob,
    handleQuerySubmit, handlePlanApprove, handleFollowUp,
    handleLoadSession, resetToQuery,
  };
}
