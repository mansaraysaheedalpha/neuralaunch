'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchFlow.tsx
//
// Full flow orchestrator for the Research Tool.
// Stages: query → planning → plan_review → executing → report
// Server interaction logic lives in useResearchFlow hook.

import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { ResearchQueryInput }        from './ResearchQueryInput';
import { ResearchPlanEditor }        from './ResearchPlanEditor';
import { ResearchProgressIndicator } from './ResearchProgressIndicator';
import { ResearchReportView }        from './ResearchReportView';
import { ResearchFollowUpInput }     from './ResearchFollowUpInput';
import { ResearchFindingCard }       from './ResearchFindingCard';
import { useResearchFlow }           from './useResearchFlow';

export interface ResearchFlowProps {
  roadmapId:  string;
  taskId:     string;
  open:       boolean;
  onClose:    () => void;
  standalone?: boolean;
  prePopulatedQuery?: string;
  /** Fired after every quota-consuming call (success or error). */
  onToolCallComplete?: () => void;
}

export function ResearchFlow({
  roadmapId, taskId, open, onClose, standalone, prePopulatedQuery, onToolCallComplete,
}: ResearchFlowProps) {
  const flow = useResearchFlow({ roadmapId, taskId, standalone, onToolCallComplete });

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
                <p className="text-[11px] text-muted-foreground">Generating research plan…</p>
              </div>
            )}

            {flow.stage === 'plan_review' && (
              <ResearchPlanEditor
                plan={flow.plan}
                estimatedTime={flow.estimatedTime}
                onApprove={(editedPlan) => { void flow.handlePlanApprove(editedPlan); }}
                onRevise={flow.handleRevise}
                loading={false}
              />
            )}

            {flow.stage === 'executing' && (
              <ResearchProgressIndicator active />
            )}

            {flow.stage === 'report' && flow.report && (
              <div className="flex flex-col gap-4">
                <ResearchReportView
                  report={flow.report}
                  roadmapId={roadmapId}
                  sessionId={flow.sessionId}
                />

                {flow.followUps.map((fu, i) => (
                  <div key={i} className="flex flex-col gap-2 pt-2 border-t border-border">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Follow-up {fu.round}: {fu.query}
                    </p>
                    {fu.findings.map((finding, j) => (
                      <ResearchFindingCard key={j} finding={finding} />
                    ))}
                  </div>
                ))}

                {flow.followUpLoading && <ResearchProgressIndicator active />}

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
