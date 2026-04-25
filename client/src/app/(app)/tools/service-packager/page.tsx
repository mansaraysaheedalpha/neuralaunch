'use client';
// src/app/(app)/tools/service-packager/page.tsx
//
// Standalone Service Packager page. Auto-detects the founder's most
// recent roadmap so the standalone packager routes can read the
// belief state and recommendation context. The founder describes the
// service from scratch — no task context.

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Loader2, Package, Plus } from 'lucide-react';
import Link from 'next/link';
import { PackagerHistoryPanel } from './PackagerHistoryPanel';
import { Textarea } from '@/components/ui/textarea';
import { PackagerContextView }    from '@/app/(app)/discovery/roadmap/[id]/packager/PackagerContextView';
import { ServicePackageView }     from '@/app/(app)/discovery/roadmap/[id]/packager/ServicePackageView';
import { PackagerAdjustInput }    from '@/app/(app)/discovery/roadmap/[id]/packager/PackagerAdjustInput';
import { PackagerHandoffButtons } from '@/app/(app)/discovery/roadmap/[id]/packager/PackagerHandoffButtons';
import type { ServiceContext, ServicePackage } from '@/lib/roadmap/service-packager/schemas';
import type { ResearchSession } from '@/lib/roadmap/research-tool/schemas';
import { buildPackagerSeedFromResearch } from '@/app/(app)/tools/packager-handoff';
import { UsageMeter } from '@/components/billing/UsageMeter';
import { useToolJob } from '@/lib/tool-jobs/use-tool-job';
import { ToolJobProgress } from '@/components/tool-jobs/ToolJobProgress';

type Stage = 'loading' | 'no_roadmap' | 'intro' | 'loading_context' | 'context' | 'loading_generation' | 'output';

export default function StandalonePackagerPage() {
  const [roadmapId,    setRoadmapId]    = useState<string | null>(null);
  const [stage,        setStage]        = useState<Stage>('loading');
  const [draft,        setDraft]        = useState('');
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  const [context,      setContext]      = useState<ServiceContext | null>(null);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [pkg,          setPkg]          = useState<ServicePackage | null>(null);
  const [adjustments,  setAdjustments]  = useState(0);
  const [pending,      setPending]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [meterRefreshKey, setMeterRefreshKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [adjustJobId,   setAdjustJobId]   = useState<string | null>(null);
  const bumpMeter = useCallback(() => {
    setMeterRefreshKey(k => k + 1);
    setHistoryRefreshKey(k => k + 1);
  }, []);

  // Polling hooks for the two long-running operations. Both no-op when
  // their jobId is null. The completion useEffects below refetch the
  // session so the package + adjustments hydrate into local state.
  const { job: generateJob } = useToolJob({ jobId: generateJobId, roadmapId });
  const { job: adjustJob }   = useToolJob({ jobId: adjustJobId,   roadmapId });

  const handleSelectSession = useCallback(async (targetSessionId: string) => {
    if (!roadmapId) return;
    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/packager/sessions/${targetSessionId}`,
      );
      if (!res.ok) return;
      const json = await res.json() as { package: ServicePackage; context: ServiceContext };
      setSessionId(targetSessionId);
      setContext(json.context);
      setPkg(json.package);
      setAgentMessage(null);
      setStage('output');
      const url = new URL(window.location.href);
      url.searchParams.set('sessionId', targetSessionId);
      url.searchParams.delete('fromResearch');
      url.searchParams.delete('roadmapId');
      window.history.replaceState({}, '', url.toString());
    } catch { /* silent — user can retry click */ }
  }, [roadmapId]);

  const handleNewSession = useCallback(() => {
    setDraft('');
    setSessionId(null);
    setContext(null);
    setAgentMessage(null);
    setPkg(null);
    setAdjustments(0);
    setError(null);
    setStage('intro');
    const url = new URL(window.location.href);
    url.searchParams.delete('sessionId');
    window.history.replaceState({}, '', url.toString());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/discovery/roadmaps/has-any');
        if (!res.ok) { setStage('no_roadmap'); return; }
        const json = await res.json() as { hasRoadmap: boolean; roadmapId?: string };
        if (!json.hasRoadmap || !json.roadmapId) { setStage('no_roadmap'); return; }
        setRoadmapId(json.roadmapId);

        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);

          // Refresh-restore: if ?sessionId= is in the URL, rehydrate
          // the output view from the persisted session so a browser
          // refresh doesn't wipe the generated package.
          const restoreSessionId = params.get('sessionId');
          if (restoreSessionId) {
            try {
              const r = await fetch(`/api/discovery/roadmaps/${json.roadmapId}/packager/sessions/${restoreSessionId}`);
              if (r.ok) {
                const rj = await r.json() as { package: ServicePackage; context: ServiceContext };
                setSessionId(restoreSessionId);
                setContext(rj.context);
                setPkg(rj.package);
                setStage('output');
                return;
              }
            } catch { /* fall through to fresh intro */ }
          }

          // Research → Packager inbound handoff. When the URL carries
          // ?fromResearch=<sessionId>, fetch that research session and
          // pre-populate the intro textarea with a description that
          // surfaces the findings (competitors, data points). The agent's
          // context confirmation step then turns this into the structured
          // ServiceContext for generation.
          const researchSessionId = params.get('fromResearch');
          const researchRoadmapId = params.get('roadmapId') ?? json.roadmapId;
          if (researchSessionId) {
            try {
              const r = await fetch(`/api/discovery/roadmaps/${researchRoadmapId}/research/sessions/${researchSessionId}`);
              if (r.ok) {
                const rj = await r.json() as { session: ResearchSession };
                setDraft(buildPackagerSeedFromResearch(rj.session));
              }
            } catch { /* fall through — degrade to empty intro */ }
          }
        }

        setStage('intro');
      } catch { setStage('no_roadmap'); }
    })();
  }, []);

  const sendInitialDescription = useCallback(async () => {
    if (!roadmapId || draft.trim().length === 0) return;
    setStage('loading_context'); setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft.trim() }),
      });
      if (!res.ok) throw new Error('Could not load context');
      const json = await res.json() as { message: string; context: ServiceContext; sessionId: string };
      setContext(json.context); setAgentMessage(json.message); setSessionId(json.sessionId);
      setStage('context');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error'); setStage('intro');
    } finally {
      bumpMeter();
    }
  }, [roadmapId, draft, bumpMeter]);

  const sendContextAdjustment = useCallback(async (message: string) => {
    if (!roadmapId || !sessionId) return;
    setPending(true); setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId }),
      });
      if (!res.ok) throw new Error('Could not adjust context');
      const json = await res.json() as { message: string; context: ServiceContext };
      setContext(json.context); setAgentMessage(json.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally { setPending(false); bumpMeter(); }
  }, [roadmapId, sessionId, bumpMeter]);

  const generatePackage = useCallback(async () => {
    if (!roadmapId || !sessionId || !context) return;
    setStage('loading_generation'); setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, sessionId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? 'Could not queue generation');
      }
      // 202 — queued. The useToolJob effect below takes over from here,
      // refetches the session on complete, and flips us to the output
      // stage with the rendered package.
      const json = await res.json() as { jobId: string; sessionId: string };
      setGenerateJobId(json.jobId);

      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('sessionId', json.sessionId);
        url.searchParams.delete('fromResearch');
        url.searchParams.delete('roadmapId');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error'); setStage('context');
      bumpMeter();
    }
  }, [roadmapId, sessionId, context, bumpMeter]);

  const sendAdjustment = useCallback(async (request: string) => {
    if (!roadmapId || !sessionId) return;
    setPending(true); setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/adjust`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, adjustmentRequest: request }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setPending(false);
        throw new Error(j.error ?? 'Could not apply adjustment');
      }
      // 202 — queued. The useToolJob effect handles completion.
      const json = await res.json() as { jobId: string };
      setAdjustJobId(json.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setPending(false);
      bumpMeter();
    }
  }, [roadmapId, sessionId, bumpMeter]);

  // -------------------------------------------------------------------
  // Job completion effects. Both refetch the session via the existing
  // single-session GET so the package, adjustments, and round count
  // hydrate into local state from the persisted source of truth.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!generateJob || !roadmapId || !sessionId) return;
    if (generateJob.stage === 'complete') {
      void (async () => {
        try {
          const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/sessions/${sessionId}`);
          if (res.ok) {
            const json = await res.json() as { package: ServicePackage; context: ServiceContext };
            setPkg(json.package);
            setStage('output');
          }
        } catch { /* swallow — UI stays on loading_generation, founder can refresh */ }
        setGenerateJobId(null);
        bumpMeter();
      })();
    }
    // 'failed' keeps the founder on loading_generation; the failed
    // ladder + retry button stays visible so they can retry without
    // re-confirming context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateJob?.stage, roadmapId, sessionId]);

  const handleRetryGenerate = useCallback(() => {
    setGenerateJobId(null);
    setError(null);
    void generatePackage();
  }, [generatePackage]);

  useEffect(() => {
    if (!adjustJob || !roadmapId || !sessionId) return;
    if (adjustJob.stage === 'complete') {
      void (async () => {
        try {
          const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/sessions/${sessionId}`);
          if (res.ok) {
            const json = await res.json() as { package: ServicePackage; context: ServiceContext; adjustments?: Array<{ round: number }> };
            setPkg(json.package);
            if (Array.isArray(json.adjustments)) setAdjustments(json.adjustments.length);
          }
        } catch { /* swallow */ }
        setAdjustJobId(null);
        setPending(false);
        bumpMeter();
      })();
    } else if (adjustJob.stage === 'failed') {
      setError(adjustJob.errorMessage ?? 'Adjustment failed.');
      setAdjustJobId(null);
      setPending(false);
      bumpMeter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustJob?.stage, roadmapId, sessionId]);

  if (stage === 'loading') {
    return <div className="flex items-center justify-center py-24"><Loader2 className="size-6 text-primary animate-spin" /></div>;
  }
  if (stage === 'no_roadmap') {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">The Service Packager needs your discovery context to set pricing and scope. Start a discovery session first.</p>
        <Link href="/discovery" className="text-sm text-primary hover:underline">Start Discovery →</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/tools" className="text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 inline mr-1" />Tools</Link>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2"><Package className="size-4 text-primary" />Service Packager</h1>
        <button
          type="button"
          onClick={handleNewSession}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Plus className="size-3 shrink-0" />
          New package
        </button>
      </div>

      <UsageMeter tool="packager" refreshKey={meterRefreshKey} />

      {error && <p className="text-xs text-red-500 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">{error}</p>}

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-72 lg:shrink-0 flex flex-col gap-4">
          {roadmapId && (
            <PackagerHistoryPanel
              roadmapId={roadmapId}
              activeSessionId={sessionId}
              onSelect={(sid) => { void handleSelectSession(sid); }}
              refreshKey={historyRefreshKey}
            />
          )}
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-6">
      {stage === 'intro' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">What service do you want to package? Describe what you&apos;d offer and who it&apos;s for.</p>
          <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4}
            placeholder="e.g. I want to package a tutoring service for high-school maths students in Lagos. Sessions are 1-on-1, in-person or online."
            className="resize-none" />
          <button type="button" onClick={() => { void sendInitialDescription(); }} disabled={draft.trim().length === 0}
            className="self-end inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">Continue</button>
        </div>
      )}
      {stage === 'loading_context' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-12 justify-center text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Building the context the Packager needs…
        </motion.div>
      )}
      {stage === 'context' && context && (
        <PackagerContextView context={context} pending={pending} agentNote={agentMessage}
          onConfirm={() => { void generatePackage(); }} onAdjust={(m) => { void sendContextAdjustment(m); }} />
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
      {stage === 'output' && pkg && roadmapId && sessionId && (
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
      </div>
    </div>
  );
}
