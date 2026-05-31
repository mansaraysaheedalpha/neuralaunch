'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchFlow.tsx
//
// Full flow orchestrator for the Research Tool.
// Stages: query → planning → plan_review → executing → report
// Server interaction logic lives in useResearchFlow hook.

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { ResearchQueryInput }        from './ResearchQueryInput';
import { ResearchPlanEditor }        from './ResearchPlanEditor';
import { ResearchProgressIndicator } from './ResearchProgressIndicator';
import { ResearchReportView }        from './ResearchReportView';
import { ResearchFollowUpInput }     from './ResearchFollowUpInput';
import { ResearchFindingCard }       from './ResearchFindingCard';
import { useResearchFlow, type UseResearchFlowResult } from './useResearchFlow';
import { ToolJobProgress }           from '@/components/tool-jobs/ToolJobProgress';

export interface ResearchFlowProps {
  roadmapId:  string;
  taskId:     string;
  open:       boolean;
  onClose:    () => void;
  standalone?: boolean;
  prePopulatedQuery?: string;
  /** Fired after every quota-consuming call (success or error). */
  onToolCallComplete?: () => void;
  /**
   * Optional pre-instantiated flow. When passed, the standalone page
   * owns the hook so it can also wire a sidebar (recent-research
   * history) against the same state. Task-launched callers don't pass
   * this — the component calls useResearchFlow internally as before.
   */
  flow?: UseResearchFlowResult;
  /**
   * When provided, the flow auto-hydrates the matching session on
   * first open (via flow.handleLoadSession) so the founder lands on
   * the rich report view + follow-up input instead of a blank query
   * input. Used by the task-card "Reopen full session" affordance
   * to make the button do what the label says — rather than mounting
   * a fresh empty flow alongside the existing completed session.
   *
   * The hydration fires once per (open=true, sessionId) pair so a
   * mid-session toggle doesn't refetch unnecessarily.
   */
  initialSessionId?: string;
}

export function ResearchFlow({
  roadmapId, taskId, open, onClose, standalone, prePopulatedQuery, onToolCallComplete,
  flow: externalFlow,
  initialSessionId,
}: ResearchFlowProps) {
  const internalFlow = useResearchFlow({
    roadmapId, taskId, standalone, onToolCallComplete,
  });
  const flow = externalFlow ?? internalFlow;

  // Hydrate-on-open: when the parent passes an initialSessionId AND
  // the flow is being opened, fire flow.handleLoadSession exactly once
  // for that (open, sessionId) pair. The ref tracks the last-loaded id
  // so a re-render with the same prop doesn't re-fetch, and a different
  // id (e.g. the user clicks Reopen on a different session) DOES
  // re-hydrate. handleLoadSession is intentionally NOT in the deps —
  // it's stable across renders via useCallback inside the hook, and
  // adding it would tighten the firing semantics for no benefit.
  const lastLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !initialSessionId) return;
    if (lastLoadedRef.current === initialSessionId) return;
    lastLoadedRef.current = initialSessionId;
    void flow.handleLoadSession(initialSessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSessionId]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-rule bg-bg shadow-lg overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-rule bg-bg-3/30">
            <p className="text-xs font-semibold text-fg">Research Tool</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:text-fg hover:bg-bg-3 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {flow.error && (
              <p className="text-[11px] text-red-500 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-2">
                {flow.error}
              </p>
            )}

            {flow.stage === 'query' && (
              <ResearchQueryInput
                onSubmit={(q) => { void flow.handleQuerySubmit(q); }}
                prePopulatedQuery={prePopulatedQuery}
                loading={false}
              />
            )}

            {flow.stage === 'planning' && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <ResearchProgressIndicator active />
                <p className="text-[11px] text-muted">Generating research plan…</p>
              </div>
            )}

            {flow.stage === 'plan_review' && (
              <ResearchPlanEditor
                plan={flow.plan}
                estimatedTime={flow.estimatedTime}
                onApprove={(editedPlan) => { void flow.handlePlanApprove(editedPlan); }}
                loading={false}
              />
            )}

            {flow.stage === 'executing' && (
              <ToolJobProgress
                title="Running your research"
                stage={flow.executeJob?.stage ?? 'queued'}
                errorMessage={flow.executeJob?.errorMessage}
                toolType="research_execute"
                onRetry={flow.handleRetryExecute}
              />
            )}

            {flow.stage === 'report' && flow.report && (
              <div className="flex flex-col gap-4">
                <ResearchReportView
                  report={flow.report}
                  roadmapId={roadmapId}
                  sessionId={flow.sessionId}
                />

                {flow.followUps.map((fu, i) => (
                  <div key={i} className="flex flex-col gap-2 pt-2 border-t border-rule">
                    <p className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                      Follow-up {fu.round}: {fu.query}
                    </p>
                    {fu.findings.map((finding, j) => (
                      <ResearchFindingCard key={j} finding={finding} />
                    ))}
                  </div>
                ))}

                {flow.followUpLoading && (
                  <ToolJobProgress
                    title="Running your follow-up"
                    stage={flow.followupJob?.stage ?? 'queued'}
                    errorMessage={flow.followupJob?.errorMessage}
                    toolType="research_followup"
                  />
                )}

                <ResearchFollowUpInput
                  round={flow.followUps.length}
                  onSubmit={(q) => { void flow.handleFollowUp(q); }}
                  disabled={flow.followUpLoading}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
