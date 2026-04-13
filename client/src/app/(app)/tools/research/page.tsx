'use client';
// src/app/(app)/tools/research/page.tsx
//
// Standalone Research Tool page. Auto-loads the founder's most recent
// roadmap ID so the standalone research routes can read the belief state
// and recommendation context. The founder describes their research need
// from scratch — no task context.

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ResearchQueryInput }        from '@/app/(app)/discovery/roadmap/[id]/research/ResearchQueryInput';
import { ResearchPlanEditor }        from '@/app/(app)/discovery/roadmap/[id]/research/ResearchPlanEditor';
import { ResearchProgressIndicator } from '@/app/(app)/discovery/roadmap/[id]/research/ResearchProgressIndicator';
import { ResearchReportView }        from '@/app/(app)/discovery/roadmap/[id]/research/ResearchReportView';
import { ResearchFollowUpInput }     from '@/app/(app)/discovery/roadmap/[id]/research/ResearchFollowUpInput';
import { ResearchFindingCard }       from '@/app/(app)/discovery/roadmap/[id]/research/ResearchFindingCard';
import type { ResearchReport, ResearchFinding } from '@/lib/roadmap/research-tool/schemas';
import { FOLLOWUP_MAX_ROUNDS } from '@/lib/roadmap/research-tool/constants';

type Stage = 'loading' | 'no_roadmap' | 'query' | 'planning' | 'plan_review' | 'executing' | 'report';

export default function StandaloneResearchPage() {
  const [roadmapId,     setRoadmapId]     = useState<string | null>(null);
  const [stage,         setStage]         = useState<Stage>('loading');
  const [query,         setQuery]         = useState('');
  const [plan,          setPlan]          = useState('');
  const [estimatedTime, setEstimatedTime] = useState('2–4 minutes');
  const [report,        setReport]        = useState<ResearchReport | null>(null);
  const [followUps,     setFollowUps]     = useState<{ query: string; findings: ResearchFinding[]; round: number }[]>([]);
  const [error,         setError]         = useState<string | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // Auto-detect the most recent roadmap
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/discovery/roadmaps/has-any');
        if (!res.ok) { setStage('no_roadmap'); return; }
        const json = await res.json() as { hasRoadmap: boolean; roadmapId?: string };
        if (!json.hasRoadmap || !json.roadmapId) { setStage('no_roadmap'); return; }
        setRoadmapId(json.roadmapId);
        setStage('query');
      } catch {
        setStage('no_roadmap');
      }
    })();
  }, []);

  const handleQuerySubmit = useCallback(async (submittedQuery: string) => {
    if (!roadmapId) return;
    setQuery(submittedQuery);
    setStage('planning');
    setError(null);

    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/research/plan`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: submittedQuery }),
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
  }, [roadmapId]);

  const handlePlanApprove = useCallback(async (editedPlan: string) => {
    if (!roadmapId) return;
    setStage('executing');
    setError(null);

    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/research/execute`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query, plan: editedPlan }),
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
  }, [roadmapId, query]);

  const handleFollowUp = useCallback(async (followQuery: string) => {
    if (!roadmapId || followUps.length >= FOLLOWUP_MAX_ROUNDS) return;
    setFollowUpLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/research/followup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: followQuery, originalQuery: query }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Follow-up failed. Please try again.');
        return;
      }

      const json = await res.json() as { findings: ResearchFinding[] };
      setFollowUps(prev => [...prev, { query: followQuery, findings: json.findings, round: prev.length + 1 }]);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setFollowUpLoading(false);
    }
  }, [roadmapId, query, followUps.length]);

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
          The Research Tool needs your discovery context to produce useful results.
          Start a discovery session first.
        </p>
        <Link href="/discovery" className="text-sm text-primary hover:underline">
          Start Discovery →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/tools" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 inline mr-1" />
          Tools
        </Link>
        <h1 className="text-lg font-bold text-foreground">Research Tool</h1>
      </div>

      {error && (
        <p className="text-xs text-red-500 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          {error}
        </p>
      )}

      {stage === 'query' && (
        <ResearchQueryInput
          onSubmit={(q) => { void handleQuerySubmit(q); }}
          loading={false}
        />
      )}

      {stage === 'planning' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="size-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Generating research plan…</p>
        </motion.div>
      )}

      {stage === 'plan_review' && (
        <ResearchPlanEditor
          plan={plan}
          estimatedTime={estimatedTime}
          onApprove={(editedPlan) => { void handlePlanApprove(editedPlan); }}
          onRevise={() => setStage('query')}
          loading={false}
        />
      )}

      {stage === 'executing' && (
        <ResearchProgressIndicator active />
      )}

      {stage === 'report' && report && (
        <div className="flex flex-col gap-6">
          <ResearchReportView report={report} onFollowUp={(q) => { void handleFollowUp(q); }} />

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
  );
}
