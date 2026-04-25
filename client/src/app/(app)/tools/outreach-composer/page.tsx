'use client';
// src/app/(app)/tools/outreach-composer/page.tsx
//
// Standalone Outreach Composer page. Auto-loads the founder's most
// recent roadmap ID so the standalone composer routes can read the
// belief state and recommendation context. The founder describes the
// outreach need from scratch — no task context.

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ComposerContextChat } from '@/app/(app)/discovery/roadmap/[id]/composer/ComposerContextChat';
import { ComposerOutputView }  from '@/app/(app)/discovery/roadmap/[id]/composer/ComposerOutputView';
import { ComposerSessionReview } from '@/app/(app)/discovery/roadmap/[id]/composer/ComposerSessionReview';
import type { OutreachContext, ComposerOutput, ComposerSession } from '@/lib/roadmap/composer/schemas';
import type { ComposerChannel, ComposerMode } from '@/lib/roadmap/composer/constants';
import {
  readPackagerHandoffParams,
  fetchPackagerHandoff,
  buildComposerSeedMessage,
} from '@/app/(app)/tools/packager-handoff';
import { UsageMeter } from '@/components/billing/UsageMeter';
import { ComposerHistoryPanel } from './ComposerHistoryPanel';
import { Plus } from 'lucide-react';
import { useToolJob } from '@/lib/tool-jobs/use-tool-job';
import { ToolJobProgress } from '@/components/tool-jobs/ToolJobProgress';

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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState<string | undefined>(undefined);
  const [meterRefreshKey, setMeterRefreshKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const bumpMeter = useCallback(() => {
    setMeterRefreshKey(k => k + 1);
    // Also refresh the sidebar list so a just-completed session shows
    // up immediately without a page reload.
    setHistoryRefreshKey(k => k + 1);
  }, []);

  const { job: generateJob } = useToolJob({ jobId: generateJobId, roadmapId });

  const handleSelectSession = useCallback(async (targetSessionId: string) => {
    if (!roadmapId) return;
    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/composer/sessions/${targetSessionId}`,
      );
      if (!res.ok) return;
      const json = await res.json() as { session: ComposerSession };
      if (!json.session.output) return; // nothing to show yet
      setContext(json.session.context);
      setMode(json.session.mode);
      setChannel(json.session.channel);
      setOutput(json.session.output);
      setSessionId(json.session.id);
      setStage('output');
      const url = new URL(window.location.href);
      url.searchParams.set('sessionId', json.session.id);
      window.history.replaceState({}, '', url.toString());
    } catch { /* swallow — user can retry the click */ }
  }, [roadmapId]);

  const handleNewSession = useCallback(() => {
    setContext(null);
    setMode(null);
    setChannel(null);
    setOutput(null);
    setSessionId(null);
    setSeedDraft(undefined);
    setError(null);
    setStage('context');
    const url = new URL(window.location.href);
    url.searchParams.delete('sessionId');
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Auto-detect the most recent roadmap, any inbound packager handoff,
  // and (on refresh) a sessionId query param for restoring a prior
  // generation. Without the sessionId-restore branch, a browser refresh
  // on the output view wiped every piece of state and forced the
  // founder to run context collection + generation again from zero —
  // even though the server had already persisted the session.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/discovery/roadmaps/has-any');
        if (!res.ok) { setStage('no_roadmap'); return; }
        const json = await res.json() as { hasRoadmap: boolean; roadmapId?: string };
        if (!json.hasRoadmap || !json.roadmapId) { setStage('no_roadmap'); return; }
        setRoadmapId(json.roadmapId);

        // Refresh-restore: if the URL carries ?sessionId=, fetch the
        // session and jump straight to the output view.
        const url = new URL(window.location.href);
        const urlSessionId = url.searchParams.get('sessionId');
        if (urlSessionId) {
          try {
            const sRes = await fetch(
              `/api/discovery/roadmaps/${json.roadmapId}/composer/sessions/${urlSessionId}`,
            );
            if (sRes.ok) {
              const sJson = await sRes.json() as { session: ComposerSession };
              if (sJson.session.output) {
                setContext(sJson.session.context);
                setMode(sJson.session.mode);
                setChannel(sJson.session.channel);
                setOutput(sJson.session.output);
                setSessionId(sJson.session.id);
                setStage('output');
                return;
              }
            }
          } catch { /* fall through to fresh start */ }
        }

        // Packager → Composer handoff.
        const handoffParams = readPackagerHandoffParams();
        if (handoffParams) {
          const handoff = await fetchPackagerHandoff(handoffParams.roadmapId, handoffParams.sessionId);
          if (handoff) setSeedDraft(buildComposerSeedMessage(handoff));
        }

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
        setError(json.error ?? 'Could not queue generation.');
        setStage('context');
        bumpMeter();
        return;
      }
      // 202 — queued. Completion useEffect handles loading the output.
      const json = await res.json() as { jobId: string; sessionId: string };
      setSessionId(json.sessionId);
      setGenerateJobId(json.jobId);

      // Push the sessionId into the URL so a browser refresh restores
      // state via the sessionId-restore branch above.
      const url = new URL(window.location.href);
      url.searchParams.set('sessionId', json.sessionId);
      window.history.replaceState({}, '', url.toString());
    } catch {
      setError('Network error — please try again.');
      setStage('context');
      bumpMeter();
    }
  }, [roadmapId, bumpMeter]);

  // Job completion: refetch the persisted session to load the output.
  useEffect(() => {
    if (!generateJob || !roadmapId || !sessionId) return;
    if (generateJob.stage === 'complete') {
      void (async () => {
        try {
          const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/composer/sessions/${sessionId}`);
          if (res.ok) {
            const json = await res.json() as { session: ComposerSession };
            if (json.session.output) {
              setOutput(json.session.output);
              setStage('output');
            }
          }
        } catch { /* swallow — refresh recovers */ }
        setGenerateJobId(null);
        bumpMeter();
      })();
    } else if (generateJob.stage === 'failed') {
      setError(generateJob.errorMessage ?? 'Generation failed.');
      setStage('context');
      setGenerateJobId(null);
      bumpMeter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateJob?.stage, roadmapId, sessionId]);

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
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/tools" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 inline mr-1" />
          Tools
        </Link>
        <h1 className="text-lg font-bold text-foreground">Outreach Composer</h1>
        <button
          type="button"
          onClick={handleNewSession}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Plus className="size-3 shrink-0" />
          New outreach
        </button>
      </div>

      <UsageMeter tool="composer" refreshKey={meterRefreshKey} />

      {error && (
        <p className="text-xs text-red-500 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">{error}</p>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-72 lg:shrink-0 flex flex-col gap-4">
          {roadmapId && (
            <ComposerHistoryPanel
              roadmapId={roadmapId}
              activeSessionId={sessionId}
              onSelect={(sid) => { void handleSelectSession(sid); }}
              refreshKey={historyRefreshKey}
            />
          )}
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-6">
      {stage === 'context' && roadmapId && (
        <ComposerContextChat
          roadmapId={roadmapId}
          taskId="standalone"
          standalone
          initialDraft={seedDraft}
          onContextComplete={(ctx, m, ch) => { void handleContextComplete(ctx, m, ch); }}
          onCancel={() => { window.location.href = '/tools'; }}
        />
      )}

      {stage === 'loading_generation' && (
        <ToolJobProgress
          title="Drafting your messages"
          stage={generateJob?.stage ?? 'queued'}
          errorMessage={generateJob?.errorMessage}
          toolType="composer_generate"
        />
      )}

      {stage === 'output' && output && channel && mode && roadmapId && sessionId && (
        <ComposerOutputView
          output={output}
          channel={channel}
          mode={mode}
          roadmapId={roadmapId}
          taskId="standalone"
          sessionId={sessionId}
          onDone={() => setStage('done')}
          onToolCallComplete={bumpMeter}
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
      </div>
    </div>
  );
}
