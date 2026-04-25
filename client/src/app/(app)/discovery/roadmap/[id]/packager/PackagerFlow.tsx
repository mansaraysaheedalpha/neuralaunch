'use client';
// src/app/(app)/discovery/roadmap/[id]/packager/PackagerFlow.tsx
//
// Full flow orchestrator for the Service Packager (task-launched mode):
//   loading_context → context → loading_generation → output → done
//
// Standalone mode is handled by the /tools/service-packager page,
// which mounts a slightly different variant of this flow that talks
// to the standalone API surface.

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import type { ServiceContext, ServicePackage } from '@/lib/roadmap/service-packager/schemas';
import { PackagerContextView }    from './PackagerContextView';
import { ServicePackageView }     from './ServicePackageView';
import { PackagerAdjustInput }    from './PackagerAdjustInput';
import { PackagerHandoffButtons } from './PackagerHandoffButtons';
import { useToolJob } from '@/lib/tool-jobs/use-tool-job';
import { ToolJobProgress } from '@/components/tool-jobs/ToolJobProgress';

type Stage = 'loading_context' | 'context' | 'loading_generation' | 'output';

export interface PackagerFlowProps {
  roadmapId: string;
  taskId:    string;
  open:      boolean;
  onClose:   () => void;
}

export function PackagerFlow({ roadmapId, taskId, open, onClose }: PackagerFlowProps) {
  const [stage,        setStage]        = useState<Stage>('loading_context');
  const [context,      setContext]      = useState<ServiceContext | null>(null);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [pkg,          setPkg]          = useState<ServicePackage | null>(null);
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  const [adjustments,  setAdjustments]  = useState(0);
  const [pending,      setPending]      = useState(false);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [adjustJobId,   setAdjustJobId]   = useState<string | null>(null);

  // Polling hooks for the two long-running operations.
  const { job: generateJob } = useToolJob({ jobId: generateJobId, roadmapId });
  const { job: adjustJob }   = useToolJob({ jobId: adjustJobId,   roadmapId });

  // First open: kick off a context exchange with an empty message so
  // the agent returns the pre-populated context (status: ready when
  // there's nothing to adjust).
  useEffect(() => {
    if (!open || stage !== 'loading_context') return;
    void (async () => {
      try {
        const res = await fetch(
          `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/packager/generate`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Open the packager.' }) },
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? 'Could not load context');
        }
        const json = await res.json() as { status: string; message: string; context: ServiceContext };
        setContext(json.context);
        setAgentMessage(json.message);
        setStage('context');
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Network error');
      }
    })();
  }, [open, stage, roadmapId, taskId]);

  const sendContextAdjustment = useCallback(async (message: string) => {
    setPending(true); setLoadError(null);
    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/packager/generate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) },
      );
      if (!res.ok) throw new Error('Could not adjust context');
      const json = await res.json() as { message: string; context: ServiceContext };
      setContext(json.context); setAgentMessage(json.message);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
    } finally { setPending(false); }
  }, [roadmapId, taskId]);

  const generatePackage = useCallback(async () => {
    if (!context) return;
    setStage('loading_generation'); setLoadError(null);
    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/packager/generate`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context }) },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? 'Could not queue generation');
      }
      // 202 — queued. The completion useEffect below loads the
      // persisted package via the task GET and flips us to 'output'.
      const json = await res.json() as { jobId: string; sessionId: string };
      setSessionId(json.sessionId);
      setGenerateJobId(json.jobId);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
      setStage('context');
    }
  }, [roadmapId, taskId, context]);

  const sendAdjustment = useCallback(async (request: string) => {
    setPending(true); setLoadError(null);
    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/packager/adjust`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adjustmentRequest: request }) },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setPending(false);
        throw new Error(j.error ?? 'Could not queue adjustment');
      }
      // 202 — queued.
      const json = await res.json() as { jobId: string };
      setAdjustJobId(json.jobId);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
      setPending(false);
    }
  }, [roadmapId, taskId]);

  // Job completion: refetch the task's packagerSession from the
  // roadmap so the package + adjustments hydrate from the persisted
  // source of truth. Falls back to keeping the loading_generation
  // stage on fetch failure so a refresh recovers.
  const refetchTaskPackager = useCallback(async () => {
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/packager`);
      if (!res.ok) return null;
      const json = await res.json() as {
        task: { packagerSession?: { id?: string; package?: ServicePackage; adjustments?: Array<{ round: number }> } | null };
      };
      return json.task.packagerSession ?? null;
    } catch { return null; }
  }, [roadmapId, taskId]);

  useEffect(() => {
    if (!generateJob) return;
    if (generateJob.stage === 'complete') {
      void (async () => {
        const session = await refetchTaskPackager();
        if (session?.package) {
          setPkg(session.package);
          if (session.id) setSessionId(session.id);
          setStage('output');
        }
        setGenerateJobId(null);
      })();
    }
    // 'failed' deliberately keeps the founder on loading_generation so
    // ToolJobProgress shows the failed ladder + retry button. They
    // retry via the button (re-fires generatePackage) or close the
    // panel to abandon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateJob?.stage]);

  const handleRetryGenerate = useCallback(() => {
    setGenerateJobId(null);
    setLoadError(null);
    void generatePackage();
  }, [generatePackage]);

  useEffect(() => {
    if (!adjustJob) return;
    if (adjustJob.stage === 'complete') {
      void (async () => {
        const session = await refetchTaskPackager();
        if (session?.package) {
          setPkg(session.package);
          if (Array.isArray(session.adjustments)) setAdjustments(session.adjustments.length);
        }
        setAdjustJobId(null);
        setPending(false);
      })();
    } else if (adjustJob.stage === 'failed') {
      setLoadError(adjustJob.errorMessage ?? 'Adjustment failed.');
      setAdjustJobId(null);
      setPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustJob?.stage]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-border bg-background shadow-lg overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold text-foreground">Service Packager</p>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="p-4">
            {loadError && (
              <p className="mb-3 text-[11px] text-red-500 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-2">{loadError}</p>
            )}
            {stage === 'loading_context' && (
              <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading the context the Packager already knows…
              </div>
            )}
            {stage === 'context' && context && (
              <PackagerContextView
                context={context} pending={pending} agentNote={agentMessage}
                onConfirm={() => { void generatePackage(); }}
                onAdjust={(m) => { void sendContextAdjustment(m); }}
              />
            )}
            {stage === 'loading_generation' && (
              <ToolJobProgress
                title="Building your service package"
                stage={generateJob?.stage ?? 'queued'}
                errorMessage={generateJob?.errorMessage}
                toolType="packager_generate"
                onRetry={handleRetryGenerate}
              />
            )}
            {stage === 'output' && pkg && sessionId && (
              <div className="flex flex-col gap-5">
                <ServicePackageView pkg={pkg} />
                {pending && (
                  <ToolJobProgress
                    title="Applying your adjustment"
                    stage={adjustJob?.stage ?? 'queued'}
                    errorMessage={adjustJob?.errorMessage}
                    toolType="packager_adjust"
                  />
                )}
                <PackagerAdjustInput adjustmentsUsed={adjustments} pending={pending} onAdjust={(r) => { void sendAdjustment(r); }} />
                <PackagerHandoffButtons roadmapId={roadmapId} packagerSessionId={sessionId} />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
