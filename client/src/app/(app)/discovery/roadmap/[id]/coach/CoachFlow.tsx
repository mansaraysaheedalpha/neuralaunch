'use client';
// src/app/(app)/discovery/roadmap/[id]/coach/CoachFlow.tsx
// Flow orchestrator: setup → loading_preparation → preparation → roleplay → debrief → done

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import type { ConversationSetup, PreparationPackage, Debrief } from '@/lib/roadmap/coach';
import { CoachSetupChat }     from './CoachSetupChat';
import { PreparationView }    from './PreparationView';
import { RolePlayChat }       from './RolePlayChat';
import { DebriefView }        from './DebriefView';
import { CoachSessionReview } from './CoachSessionReview';

type Stage =
  | 'setup'
  | 'loading_preparation'
  | 'preparation'
  | 'roleplay'
  | 'loading_debrief'
  | 'debrief'
  | 'done';

export interface CoachFlowProps {
  roadmapId: string;
  taskId:    string;
  open:      boolean;
  onClose:   () => void;
}

/** Stage machine for the Coach. Owns prepare + debrief server calls. */
export function CoachFlow({ roadmapId, taskId, open, onClose }: CoachFlowProps) {
  const [stage,       setStage]       = useState<Stage>('setup');
  const [setup,       setSetup]       = useState<ConversationSetup | null>(null);
  const [preparation, setPreparation] = useState<PreparationPackage | null>(null);
  const [debrief,     setDebrief]     = useState<Debrief | null>(null);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  const handleSetupComplete = useCallback(async (completed: ConversationSetup) => {
    setSetup(completed);
    setStage('loading_preparation');
    setLoadError(null);

    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/coach/prepare`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    '{}',
        },
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setLoadError(json.error ?? 'Could not generate preparation. Please try again.');
        setStage('setup');
        return;
      }

      const json = await res.json() as { preparation: PreparationPackage };
      setPreparation(json.preparation);
      setStage('preparation');
    } catch {
      setLoadError('Network error — please try again.');
      setStage('setup');
    }
  }, [roadmapId, taskId]);

  const handleRolePlayEnd = useCallback(async () => {
    setStage('loading_debrief');
    setLoadError(null);

    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/coach/debrief`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    '{}',
        },
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setLoadError(json.error ?? 'Could not generate debrief. Please try again.');
        setStage('roleplay');
        return;
      }

      const json = await res.json() as { debrief: Debrief };
      setDebrief(json.debrief);
      setStage('debrief');
    } catch {
      setLoadError('Network error — please try again.');
      setStage('roleplay');
    }
  }, [roadmapId, taskId]);

  const completedSession =
    setup && preparation
      ? {
          setup,
          preparation,
          channel:   setup.channel,
          debrief:   debrief ?? undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }} className="rounded-xl border border-border bg-background shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold text-foreground">Conversation Coach</p>
            <button type="button" onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="p-4">
            {loadError && (
              <p className="mb-3 text-[11px] text-red-500 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-2">
                {loadError}
              </p>
            )}

            {/* Stage: setup */}
            {stage === 'setup' && (
              <CoachSetupChat
                roadmapId={roadmapId}
                taskId={taskId}
                onSetupComplete={(s) => { void handleSetupComplete(s); }}
                onCancel={onClose}
              />
            )}

            {/* Stage: loading_preparation */}
            {stage === 'loading_preparation' && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Generating your preparation package…</p>
                <p className="text-[11px] text-muted-foreground">This takes about 30 seconds.</p>
              </div>
            )}

            {/* Stage: preparation */}
            {stage === 'preparation' && preparation && setup && (
              <PreparationView
                preparation={preparation}
                channel={setup.channel}
                onStartReplay={() => setStage('roleplay')}
              />
            )}

            {/* Stage: roleplay */}
            {stage === 'roleplay' && setup && (
              <RolePlayChat
                roadmapId={roadmapId}
                taskId={taskId}
                otherPartyName={setup.who}
                onEnd={() => { void handleRolePlayEnd(); }}
              />
            )}

            {/* Stage: loading_debrief */}
            {stage === 'loading_debrief' && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Generating your debrief…</p>
              </div>
            )}

            {/* Stage: debrief */}
            {stage === 'debrief' && debrief && (
              <DebriefView
                debrief={debrief}
                onDone={() => setStage('done')}
              />
            )}

            {/* Stage: done */}
            {stage === 'done' && completedSession && (
              <div className="flex flex-col gap-4">
                <CoachSessionReview session={completedSession as Record<string, unknown>} />
                <button type="button" onClick={onClose}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
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
