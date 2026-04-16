'use client';
// src/app/(app)/tools/research/page.tsx
//
// Standalone Research Tool page. Auto-loads the most recent roadmap
// and delegates to ResearchFlow with standalone=true. No duplicated
// state machine — the flow component handles everything.

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ResearchFlow } from '@/app/(app)/discovery/roadmap/[id]/research/ResearchFlow';
import {
  readPackagerHandoffParams,
  fetchPackagerHandoff,
  buildResearchQueryFromPackage,
} from '@/app/(app)/tools/packager-handoff';

export default function StandaloneResearchPage() {
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [seedQuery, setSeedQuery] = useState<string | undefined>(undefined);

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
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/tools" className="text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 inline mr-1" />
          Tools
        </Link>
        <h1 className="text-lg font-bold text-foreground">Research Tool</h1>
      </div>

      <ResearchFlow
        roadmapId={roadmapId}
        taskId="standalone"
        open
        onClose={() => { window.location.href = '/tools'; }}
        standalone
        prePopulatedQuery={seedQuery}
      />
    </div>
  );
}
