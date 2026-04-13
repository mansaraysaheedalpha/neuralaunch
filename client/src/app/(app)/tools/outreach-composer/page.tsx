'use client';
// src/app/(app)/tools/outreach-composer/page.tsx
//
// Standalone Outreach Composer page. Auto-loads the founder's most
// recent roadmap ID so the standalone composer routes can read the
// belief state and recommendation context. The founder describes the
// outreach need from scratch — no task context.

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ComposerContextChat } from '@/app/(app)/discovery/roadmap/[id]/composer/ComposerContextChat';
import { ComposerOutputView }  from '@/app/(app)/discovery/roadmap/[id]/composer/ComposerOutputView';
import { ComposerSessionReview } from '@/app/(app)/discovery/roadmap/[id]/composer/ComposerSessionReview';
import type { OutreachContext, ComposerOutput } from '@/lib/roadmap/composer/schemas';
import type { ComposerChannel, ComposerMode } from '@/lib/roadmap/composer/constants';

type Stage =
  | 'loading'
  | 'no_roadmap'
  | 'context'
  | 'loading_generation'
  | 'output'
  | 'done';

export default function StandaloneComposerPage() {
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const [stage,     setStage]     = useState<Stage>('loading');
  const [context,   setContext]   = useState<OutreachContext | null>(null);
  const [mode,      setMode]      = useState<ComposerMode | null>(null);
  const [channel,   setChannel]   = useState<ComposerChannel | null>(null);
  const [output,    setOutput]    = useState<ComposerOutput | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  // Auto-detect the most recent roadmap
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/discovery/roadmaps/has-any');
        if (!res.ok) { setStage('no_roadmap'); return; }
        const json = await res.json() as { hasRoadmap: boolean; roadmapId?: string };
        if (!json.hasRoadmap || !json.roadmapId) { setStage('no_roadmap'); return; }
        setRoadmapId(json.roadmapId);
        setStage('context');
      } catch {
        setStage('no_roadmap');
      }
    })();
  }, []);

  const handleContextComplete = useCallback(async (
    completedContext: OutreachContext,
    completedMode:    ComposerMode,
    completedChannel: ComposerChannel,
  ) => {
    if (!roadmapId) return;
    setContext(completedContext);
    setMode(completedMode);
    setChannel(completedChannel);
    setStage('loading_generation');
    setError(null);

    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/composer/generate`,
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
        setError(json.error ?? 'Could not generate messages. Please try again.');
        setStage('context');
        return;
      }

      const json = await res.json() as { output: ComposerOutput };
      setOutput(json.output);
      setStage('output');
    } catch {
      setError('Network error — please try again.');
      setStage('context');
    }
  }, [roadmapId]);

  if (stage === 'loading') {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 text-primary animate-spin" />
      </div>
    );
  }

  if (stage === 'no_roadmap') {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          The Outreach Composer needs your discovery context to produce useful messages.
          Start a discovery session first.
        </p>
        <Link href="/discovery" className="text-sm text-primary hover:underline">
          Start Discovery →
        </Link>
      </div>
    );
  }

  const completedSession =
    context && mode && channel && output
      ? { id: crypto.randomUUID(), tool: 'outreach_composer' as const, context, mode, channel, output,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      : null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/tools" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 inline mr-1" />
          Tools
        </Link>
        <h1 className="text-lg font-bold text-foreground">Outreach Composer</h1>
      </div>

      {error && (
        <p className="text-xs text-red-500 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">{error}</p>
      )}

      {stage === 'context' && roadmapId && (
        <ComposerContextChat
          roadmapId={roadmapId}
          taskId="standalone"
          onContextComplete={(ctx, m, ch) => { void handleContextComplete(ctx, m, ch); }}
          onCancel={() => { window.location.href = '/tools'; }}
        />
      )}

      {stage === 'loading_generation' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 py-16"
        >
          <Loader2 className="size-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            Drafting your messages… This takes about 20 seconds.
          </p>
        </motion.div>
      )}

      {stage === 'output' && output && channel && mode && roadmapId && (
        <ComposerOutputView
          output={output}
          channel={channel}
          mode={mode}
          roadmapId={roadmapId}
          taskId="standalone"
          onDone={() => setStage('done')}
        />
      )}

      {stage === 'done' && completedSession && (
        <div className="flex flex-col gap-4">
          <ComposerSessionReview session={completedSession as Record<string, unknown>} />
          <Link href="/tools" className="text-sm text-primary hover:underline self-start">
            Back to Tools
          </Link>
        </div>
      )}
    </div>
  );
}
