'use client';
// src/app/(app)/discovery/roadmap/[id]/composer/ComposerFlow.tsx
//
// Full flow orchestrator for the Outreach Composer:
//   context → loading_generation → output → done

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import type { OutreachContext, ComposerOutput } from '@/lib/roadmap/composer/schemas';
import type { ComposerChannel, ComposerMode } from '@/lib/roadmap/composer/constants';
import { ComposerContextChat } from './ComposerContextChat';
import { ComposerOutputView }  from './ComposerOutputView';
import { ComposerSessionReview } from './ComposerSessionReview';
import { useToolJob } from '@/lib/tool-jobs/use-tool-job';
import { ToolJobProgress } from '@/components/tool-jobs/ToolJobProgress';

type Stage =
  | 'context'
  | 'loading_generation'
  | 'output'
  | 'done';

export interface ComposerFlowProps {
  roadmapId: string;
  taskId:    string;
  open:      boolean;
  onClose:   () => void;
}

/**
 * ComposerFlow
 *
 * State machine for the Outreach Composer. Owns the context collection
 * and generation server calls. Delegates rendering to ComposerContextChat
 * and ComposerOutputView per stage.
 */
export function ComposerFlow({ roadmapId, taskId, open, onClose }: ComposerFlowProps) {
  const [stage,     setStage]     = useState<Stage>('context');
  const [context,   setContext]   = useState<OutreachContext | null>(null);
  const [mode,      setMode]      = useState<ComposerMode | null>(null);
  const [channel,   setChannel]   = useState<ComposerChannel | null>(null);
  const [output,    setOutput]    = useState<ComposerOutput | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);

  const { job: generateJob } = useToolJob({ jobId: generateJobId, roadmapId });

  const handleContextComplete = useCallback(async (
    completedContext: OutreachContext,
    completedMode:    ComposerMode,
    completedChannel: ComposerChannel,
  ) => {
    setContext(completedContext);
    setMode(completedMode);
    setChannel(completedChannel);
    setStage('loading_generation');
    setLoadError(null);

    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer/generate`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            context: completedContext,
            mode:    completedMode,
            channel: completedChannel,
          }),
        },
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setLoadError(json.error ?? 'Could not queue generation.');
        setStage('context');
        return;
      }
      // 202 — queued. Completion useEffect handles loading the output.
      const json = await res.json() as { jobId: string; sessionId: string };
      setGenerateJobId(json.jobId);
    } catch {
      setLoadError('Network error — please try again.');
      setStage('context');
    }
  }, [roadmapId, taskId]);

  useEffect(() => {
    if (!generateJob) return;
    if (generateJob.stage === 'complete') {
      void (async () => {
        try {
          const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer`);
          if (res.ok) {
            const json = await res.json() as { task: { composerSession?: { output?: ComposerOutput } | null } };
            if (json.task.composerSession?.output) {
              setOutput(json.task.composerSession.output);
              setStage('output');
            }
          }
        } catch { /* swallow — refresh recovers */ }
        setGenerateJobId(null);
      })();
    }
    // 'failed' keeps founder on loading_generation; failed ladder +
    // retry button in ToolJobProgress is the recovery path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateJob?.stage]);

  const handleRetryGenerate = useCallback(() => {
    if (!context || !mode || !channel) return;
    setGenerateJobId(null);
    setLoadError(null);
    void handleContextComplete(context, mode, channel);
  }, [context, mode, channel, handleContextComplete]);

  const completedSession =
    context && mode && channel && output
      ? {
          id:        crypto.randomUUID(),
          tool:      'outreach_composer' as const,
          context,
          mode,
          channel,
          output,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null;

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
            <p className="text-xs font-semibold text-foreground">Outreach Composer</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="p-4">
            {loadError && (
              <p className="mb-3 text-[11px] text-red-500 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-2">
                {loadError}
              </p>
            )}

            {/* Stage: context */}
            {stage === 'context' && (
              <ComposerContextChat
                roadmapId={roadmapId}
                taskId={taskId}
                onContextComplete={(ctx, m, ch) => { void handleContextComplete(ctx, m, ch); }}
                onCancel={onClose}
              />
            )}

            {/* Stage: loading_generation */}
            {stage === 'loading_generation' && (
              <ToolJobProgress
                title="Drafting your messages"
                stage={generateJob?.stage ?? 'queued'}
                errorMessage={generateJob?.errorMessage}
                toolType="composer_generate"
                onRetry={handleRetryGenerate}
              />
            )}

            {/* Stage: output */}
            {stage === 'output' && output && channel && mode && (
              <ComposerOutputView
                output={output}
                channel={channel}
                mode={mode}
                roadmapId={roadmapId}
                taskId={taskId}
                onDone={() => setStage('done')}
              />
            )}

            {/* Stage: done */}
            {stage === 'done' && completedSession && (
              <div className="flex flex-col gap-4">
                <ComposerSessionReview session={completedSession as Record<string, unknown>} />
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
