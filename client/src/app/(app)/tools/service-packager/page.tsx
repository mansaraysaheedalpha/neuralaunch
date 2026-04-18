'use client';
// src/app/(app)/tools/service-packager/page.tsx
//
// Standalone Service Packager page. Auto-detects the founder's most
// recent roadmap so the standalone packager routes can read the
// belief state and recommendation context. The founder describes the
// service from scratch — no task context.

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Loader2, Package } from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { PackagerContextView }    from '@/app/(app)/discovery/roadmap/[id]/packager/PackagerContextView';
import { ServicePackageView }     from '@/app/(app)/discovery/roadmap/[id]/packager/ServicePackageView';
import { PackagerAdjustInput }    from '@/app/(app)/discovery/roadmap/[id]/packager/PackagerAdjustInput';
import { PackagerHandoffButtons } from '@/app/(app)/discovery/roadmap/[id]/packager/PackagerHandoffButtons';
import type { ServiceContext, ServicePackage } from '@/lib/roadmap/service-packager/schemas';
import type { ResearchSession } from '@/lib/roadmap/research-tool/schemas';
import { buildPackagerSeedFromResearch } from '@/app/(app)/tools/packager-handoff';
import { UsageMeter } from '@/components/billing/UsageMeter';

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

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/discovery/roadmaps/has-any');
        if (!res.ok) { setStage('no_roadmap'); return; }
        const json = await res.json() as { hasRoadmap: boolean; roadmapId?: string };
        if (!json.hasRoadmap || !json.roadmapId) { setStage('no_roadmap'); return; }
        setRoadmapId(json.roadmapId);

        // Research → Packager inbound handoff. When the URL carries
        // ?fromResearch=<sessionId>, fetch that research session and
        // pre-populate the intro textarea with a description that
        // surfaces the findings (competitors, data points). The agent's
        // context confirmation step then turns this into the structured
        // ServiceContext for generation.
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
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
    }
  }, [roadmapId, draft]);

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
    } finally { setPending(false); }
  }, [roadmapId, sessionId]);

  const generatePackage = useCallback(async () => {
    if (!roadmapId || !sessionId || !context) return;
    setStage('loading_generation'); setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, sessionId }),
      });
      if (!res.ok) throw new Error('Could not generate package');
      const json = await res.json() as { package: ServicePackage; sessionId: string };
      setPkg(json.package); setStage('output');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error'); setStage('context');
    }
  }, [roadmapId, sessionId, context]);

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
        throw new Error(j.error ?? 'Could not apply adjustment');
      }
      const json = await res.json() as { package: ServicePackage; round: number };
      setPkg(json.package); setAdjustments(json.round);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally { setPending(false); }
  }, [roadmapId, sessionId]);

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
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/tools" className="text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 inline mr-1" />Tools</Link>
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2"><Package className="size-4 text-primary" />Service Packager</h1>
      </div>

      <UsageMeter tool="packager" />

      {error && <p className="text-xs text-red-500 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">{error}</p>}

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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="size-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Building your service package… about 30 seconds.</p>
        </motion.div>
      )}
      {stage === 'output' && pkg && roadmapId && sessionId && (
        <div className="flex flex-col gap-5">
          <ServicePackageView pkg={pkg} />
          <PackagerAdjustInput adjustmentsUsed={adjustments} pending={pending} onAdjust={(r) => { void sendAdjustment(r); }} />
          <PackagerHandoffButtons roadmapId={roadmapId} packagerSessionId={sessionId} />
        </div>
      )}
    </div>
  );
}
