'use client';
// src/app/(app)/tools/research/page.tsx
//
// Standalone Research Tool page. Auto-loads the most recent roadmap
// and delegates to ResearchFlow with standalone=true. No duplicated
// state machine — the flow component handles everything.

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { ToolShell, ToolShellLoading, ToolShellNoRoadmap } from '@/components/institute/tools';
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

  // Shell metadata for the transient states. Kept aligned with the
  // loaded-page render below so loading-then-loaded has no chrome shift.
  const shellProps = {
    model: 'Opus',
    toolName: 'Research Tool',
    roman: 'III' as const,
    description: 'Plain-language query → cited findings',
    heading: <>Research, <em>cited.</em></>,
    lede: <>Ask any question about your market, competitors, customers, regulations, or pricing. The tool runs a multi-source investigation and returns a structured report with source URLs and confidence labels — <em>verified, likely, unverified.</em></>,
  };

  if (loading) {
    return <ToolShellLoading {...shellProps} />;
  }

  if (!roadmapId) {
    return (
      <ToolShellNoRoadmap
        {...shellProps}
        message="The Research Tool needs your discovery context to produce relevant results. Start a discovery session first."
      />
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
    <ToolShell
      model="Opus"
      toolName="Research Tool"
      roman="III"
      description="Plain-language query → cited findings"
      heading={<>Research, <em>cited.</em></>}
      lede={<>Ask any question about your market, competitors, customers, regulations, or pricing. The tool runs a multi-source investigation and returns a structured report with source URLs and confidence labels — <em>verified, likely, unverified.</em></>}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={flow.resetToQuery}
            className="flex items-center gap-1.5 rounded-md border border-rule-strong px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fg hover:border-accent hover:text-accent transition-colors"
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
    </ToolShell>
  );
}
