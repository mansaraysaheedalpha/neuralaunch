'use client';
// src/app/(app)/tools/research/page.tsx
//
// Standalone Research Tool page. Auto-loads the most recent roadmap
// and delegates to ResearchFlow with standalone=true. No duplicated
// state machine — the flow component handles everything.

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { ResearchFlow } from '@/app/(app)/discovery/roadmap/[id]/research/ResearchFlow';
import { useResearchFlow } from '@/app/(app)/discovery/roadmap/[id]/research/useResearchFlow';
import {
  readPackagerHandoffParams,
  fetchPackagerHandoff,
  buildResearchQueryFromPackage,
} from '@/app/(app)/tools/packager-handoff';
import { UsageMeter } from '@/components/billing/UsageMeter';
import { ResearchHistoryPanel } from './ResearchHistoryPanel';

export default function StandaloneResearchPage() {
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [seedQuery, setSeedQuery] = useState<string | undefined>(undefined);
  const [meterRefreshKey, setMeterRefreshKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const handleToolCallComplete = useCallback(() => {
    setMeterRefreshKey(k => k + 1);
    // A new report / plan / follow-up just persisted; re-fetch the
    // history list so the sidebar reflects the latest state.
    setHistoryRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/discovery/roadmaps/has-any');
        if (!res.ok) { setLoading(false); return; }
        const json = await res.json() as { hasRoadmap: boolean; roadmapId?: string };
        if (json.hasRoadmap && json.roadmapId) setRoadmapId(json.roadmapId);
      } catch { /* fall through */ }

      // Packager → Research handoff: when the URL carries fromPackager,
      // fetch the package and build a sensible initial research query
      // for the founder to confirm or edit before submitting.
      const handoffParams = readPackagerHandoffParams();
      if (handoffParams) {
        const handoff = await fetchPackagerHandoff(handoffParams.roadmapId, handoffParams.sessionId);
        if (handoff) setSeedQuery(buildResearchQueryFromPackage(handoff));
      }

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!roadmapId) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          The Research Tool needs your discovery context to produce relevant results.
          Start a discovery session first.
        </p>
        <Link href="/discovery" className="text-sm text-primary hover:underline">
          Start Discovery →
        </Link>
      </div>
    );
  }

  return (
    <StandaloneResearchPageLoaded
      roadmapId={roadmapId}
      seedQuery={seedQuery}
      meterRefreshKey={meterRefreshKey}
      historyRefreshKey={historyRefreshKey}
      onToolCallComplete={handleToolCallComplete}
    />
  );
}

// Split so useResearchFlow can be called unconditionally (hooks rules)
// once roadmapId has been resolved — the parent component has an
// early-return branch for the not-yet-loaded case.
function StandaloneResearchPageLoaded({
  roadmapId, seedQuery, meterRefreshKey, historyRefreshKey, onToolCallComplete,
}: {
  roadmapId:         string;
  seedQuery:         string | undefined;
  meterRefreshKey:   number;
  historyRefreshKey: number;
  onToolCallComplete: () => void;
}) {
  const flow = useResearchFlow({
    roadmapId,
    taskId:     'standalone',
    standalone: true,
    onToolCallComplete,
  });

  const handleSelectSession = useCallback((sid: string) => {
    void flow.handleLoadSession(sid);
  }, [flow]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/tools" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 inline mr-1" />
          Tools
        </Link>
        <h1 className="text-lg font-bold text-foreground">Research Tool</h1>
        <button
          type="button"
          onClick={flow.resetToQuery}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Plus className="size-3 shrink-0" />
          New research
        </button>
      </div>

      <UsageMeter tool="research" refreshKey={meterRefreshKey} />

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-72 lg:shrink-0 flex flex-col gap-4">
          <ResearchHistoryPanel
            roadmapId={roadmapId}
            activeSessionId={flow.sessionId}
            onSelect={handleSelectSession}
            refreshKey={historyRefreshKey}
          />
        </aside>

        <div className="flex-1 min-w-0">
          <ResearchFlow
            roadmapId={roadmapId}
            taskId="standalone"
            open
            onClose={() => { window.location.href = '/tools'; }}
            standalone
            prePopulatedQuery={seedQuery}
            onToolCallComplete={onToolCallComplete}
            flow={flow}
          />
        </div>
      </div>
    </div>
  );
}
