'use client';
// src/app/(app)/discovery/roadmap/[id]/research/useResearchFlow.ts
//
// Custom hook encapsulating the Research Tool's server interaction
// logic. Extracted from ResearchFlow.tsx to keep the component
// under the 200-line cap.

import { useState, useCallback } from 'react';
import type { ResearchReport, ResearchFinding } from '@/lib/roadmap/research-tool/schemas';
import { FOLLOWUP_MAX_ROUNDS } from '@/lib/roadmap/research-tool/constants';

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
  handleQuerySubmit: (q: string) => Promise<void>;
  handlePlanApprove: (editedPlan: string) => Promise<void>;
  handleFollowUp:    (q: string) => Promise<void>;
  handleRevise:      () => void;
}

export function useResearchFlow(input: {
  roadmapId:  string;
  taskId:     string;
  standalone?: boolean;
}): UseResearchFlowResult {
  const { roadmapId, taskId, standalone } = input;

  const [stage,        setStage]        = useState<Stage>('query');
  const [query,        setQuery]        = useState('');
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  const [plan,         setPlan]         = useState('');
  const [estimatedTime, setEstimatedTime] = useState('2–4 minutes');
  const [report,       setReport]       = useState<ResearchReport | null>(null);
  const [followUps,    setFollowUps]    = useState<Array<{ query: string; findings: ResearchFinding[]; round: number }>>([]);
  const [error,        setError]        = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);

  const planUrl     = standalone ? `/api/discovery/roadmaps/${roadmapId}/research/plan`     : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/plan`;
  const executeUrl  = standalone ? `/api/discovery/roadmaps/${roadmapId}/research/execute`  : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/execute`;
  const followupUrl = standalone ? `/api/discovery/roadmaps/${roadmapId}/research/followup` : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/followup`;

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
    }
  }, [planUrl]);

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
        setError(json.error ?? 'Research execution failed.');
        setStage('plan_review');
        return;
      }
      const json = await res.json() as { report: ResearchReport };
      setReport(json.report);
      setStage('report');
    } catch {
      setError('Network error — please try again.');
      setStage('plan_review');
    }
  }, [executeUrl, standalone, sessionId]);

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
        setError(json.error ?? 'Follow-up failed.');
        return;
      }
      const json = await res.json() as { findings: ResearchFinding[] };
      setFollowUps(prev => [...prev, { query: followQuery, findings: json.findings, round: prev.length + 1 }]);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setFollowUpLoading(false);
    }
  }, [followupUrl, standalone, sessionId, followUps.length]);

  const handleRevise = useCallback(() => setStage('query'), []);

  return {
    stage, query, plan, estimatedTime, report, sessionId, followUps,
    error, followUpLoading,
    handleQuerySubmit, handlePlanApprove, handleFollowUp, handleRevise,
  };
}
