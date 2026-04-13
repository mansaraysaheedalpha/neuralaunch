'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchFlow.tsx
//
// Full flow orchestrator for the Research Tool.
// Stages: query → planning → plan_review → executing → report
// The report stage includes an inline follow-up loop (up to 5 rounds).

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { ResearchQueryInput }         from './ResearchQueryInput';
import { ResearchPlanEditor }         from './ResearchPlanEditor';
import { ResearchProgressIndicator }  from './ResearchProgressIndicator';
import { ResearchReportView }         from './ResearchReportView';
import { ResearchFollowUpInput }      from './ResearchFollowUpInput';
import { ResearchFindingCard }        from './ResearchFindingCard';
// Import types directly from schemas, not the barrel.
import type { ResearchReport, ResearchFinding } from '@/lib/roadmap/research-tool/schemas';
import { FOLLOWUP_MAX_ROUNDS } from '@/lib/roadmap/research-tool/constants';

type Stage = 'query' | 'planning' | 'plan_review' | 'executing' | 'report';

export interface ResearchFlowProps {
  roadmapId:  string;
  taskId:     string;
  open:       boolean;
  onClose:    () => void;
  standalone?: boolean;
  /** Pre-populated query suggestion from task context */
  prePopulatedQuery?: string;
}

/**
 * ResearchFlow
 *
 * Stage machine for the Research Tool. Owns the plan and execute
 * server calls. Manages the follow-up loop inline after the report.
 * Standalone prop switches URL patterns to the roadmap-level routes.
 */
export function ResearchFlow({
  roadmapId,
  taskId,
  open,
  onClose,
  standalone,
  prePopulatedQuery,
}: ResearchFlowProps) {
  const [stage,        setStage]        = useState<Stage>('query');
  const [query,        setQuery]        = useState('');
  const [plan,         setPlan]         = useState('');
  const [estimatedTime, setEstimatedTime] = useState('2–4 minutes');
  const [report,       setReport]       = useState<ResearchReport | null>(null);
  const [followUps,    setFollowUps]    = useState<{ query: string; findings: ResearchFinding[]; round: number }[]>([]);
  const [error,        setError]        = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // Build route URL — standalone uses roadmap-level routes, task uses task-level
  function planUrl()     { return standalone ? `/api/discovery/roadmaps/${roadmapId}/research/plan`    : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/plan`; }
  function executeUrl()  { return standalone ? `/api/discovery/roadmaps/${roadmapId}/research/execute` : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/execute`; }
  function followupUrl() { return standalone ? `/api/discovery/roadmaps/${roadmapId}/research/followup`: `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/followup`; }

  const handleQuerySubmit = useCallback(async (submittedQuery: string) => {
    setQuery(submittedQuery);
    setStage('planning');
    setError(null);

    try {
      const res = await fetch(planUrl(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: submittedQuery, taskId }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not generate research plan. Please try again.');
        setStage('query');
        return;
      }

      const json = await res.json() as { plan: string; estimatedTime?: string };
      setPlan(json.plan);
      if (json.estimatedTime) setEstimatedTime(json.estimatedTime);
      setStage('plan_review');
    } catch {
      setError('Network error — please try again.');
      setStage('query');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmapId, taskId, standalone]);

  const handlePlanApprove = useCallback(async (editedPlan: string) => {
    setStage('executing');
    setError(null);

    try {
      const res = await fetch(executeUrl(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query, plan: editedPlan, taskId }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Research execution failed. Please try again.');
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmapId, taskId, standalone, query]);

  const handleFollowUp = useCallback(async (followQuery: string) => {
    if (followUps.length >= FOLLOWUP_MAX_ROUNDS) return;
    setFollowUpLoading(true);
    setError(null);

    try {
      const res = await fetch(followupUrl(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: followQuery, originalQuery: query, taskId }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Follow-up failed. Please try again.');
        return;
      }

      const json = await res.json() as { findings: ResearchFinding[] };
      setFollowUps(prev => [...prev, {
        query:    followQuery,
        findings: json.findings,
        round:    prev.length + 1,
      }]);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setFollowUpLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmapId, taskId, standalone, query, followUps.length]);

  function handleRevise() {
    setStage('query');
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-border bg-background shadow-lg overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold text-foreground">Research Tool</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {error && (
              <p className="text-[11px] text-red-500 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-2">
                {error}
              </p>
            )}

            {stage === 'query' && (
              <ResearchQueryInput
                onSubmit={(q) => { void handleQuerySubmit(q); }}
                prePopulatedQuery={prePopulatedQuery}
                loading={false}
              />
            )}

            {stage === 'planning' && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <ResearchProgressIndicator active />
                <p className="text-[11px] text-muted-foreground">Generating research plan…</p>
              </div>
            )}

            {stage === 'plan_review' && (
              <ResearchPlanEditor
                plan={plan}
                estimatedTime={estimatedTime}
                onApprove={(editedPlan) => { void handlePlanApprove(editedPlan); }}
                onRevise={handleRevise}
                loading={false}
              />
            )}

            {stage === 'executing' && (
              <ResearchProgressIndicator active />
            )}

            {stage === 'report' && report && (
              <div className="flex flex-col gap-4">
                <ResearchReportView
                  report={report}
                  onFollowUp={(q) => { void handleFollowUp(q); }}
                />

                {/* Inline follow-up findings */}
                {followUps.map((fu, i) => (
                  <div key={i} className="flex flex-col gap-2 pt-2 border-t border-border">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Follow-up {fu.round}: {fu.query}
                    </p>
                    {fu.findings.map((finding, j) => (
                      <ResearchFindingCard key={j} finding={finding} />
                    ))}
                  </div>
                ))}

                {followUpLoading && <ResearchProgressIndicator active />}

                <ResearchFollowUpInput
                  round={followUps.length}
                  onSubmit={(q) => { void handleFollowUp(q); }}
                  disabled={followUpLoading}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
