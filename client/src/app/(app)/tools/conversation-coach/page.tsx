'use client';
// src/app/(app)/tools/conversation-coach/page.tsx
//
// Standalone Conversation Coach page. Auto-loads the founder's most
// recent roadmap ID so the standalone coach routes can read the
// belief state and recommendation context. The founder describes the
// conversation from scratch — no task context.

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { CoachSetupChat } from '@/app/(app)/discovery/roadmap/[id]/coach/CoachSetupChat';
import { PreparationView } from '@/app/(app)/discovery/roadmap/[id]/coach/PreparationView';
import { RolePlayChat } from '@/app/(app)/discovery/roadmap/[id]/coach/RolePlayChat';
import { DebriefView } from '@/app/(app)/discovery/roadmap/[id]/coach/DebriefView';
import type { ConversationSetup, PreparationPackage, Debrief } from '@/lib/roadmap/coach';
import {
  readPackagerHandoffParams,
  fetchPackagerHandoff,
  buildCoachSeedMessage,
} from '@/app/(app)/tools/packager-handoff';
import { UsageMeter } from '@/components/billing/UsageMeter';

type Stage = 'loading' | 'no_roadmap' | 'setup' | 'loading_preparation' | 'preparation' | 'roleplay' | 'loading_debrief' | 'debrief' | 'done';

export default function StandaloneCoachPage() {
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const [stage, setStage]         = useState<Stage>('loading');
  const [setup, setSetup]         = useState<ConversationSetup | null>(null);
  const [preparation, setPrep]    = useState<PreparationPackage | null>(null);
  const [debrief, setDebrief]     = useState<Debrief | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState<string | undefined>(undefined);
  const [meterRefreshKey, setMeterRefreshKey] = useState(0);
  const bumpMeter = useCallback(() => {
    setMeterRefreshKey(k => k + 1);
  }, []);

  // Auto-detect the most recent roadmap and any inbound packager handoff.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/discovery/roadmaps/has-any');
        if (!res.ok) { setStage('no_roadmap'); return; }
        const json = await res.json() as { hasRoadmap: boolean; roadmapId?: string };
        if (!json.hasRoadmap || !json.roadmapId) { setStage('no_roadmap'); return; }
        setRoadmapId(json.roadmapId);

        // Packager → Coach handoff.
        const handoffParams = readPackagerHandoffParams();
        if (handoffParams) {
          const handoff = await fetchPackagerHandoff(handoffParams.roadmapId, handoffParams.sessionId);
          if (handoff) setSeedDraft(buildCoachSeedMessage(handoff));
        }

        setStage('setup');
      } catch {
        setStage('no_roadmap');
      }
    })();
  }, []);

  const handleSetupComplete = useCallback(async (completed: ConversationSetup) => {
    if (!roadmapId) return;
    setSetup(completed);
    setStage('loading_preparation');
    setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/coach/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not generate preparation.');
        setStage('setup');
        return;
      }
      const json = await res.json() as { preparation: PreparationPackage };
      setPrep(json.preparation);
      setStage('preparation');
    } catch {
      setError('Network error.');
      setStage('setup');
    } finally {
      bumpMeter();
    }
  }, [roadmapId, bumpMeter]);

  const handleRolePlayEnd = useCallback(async () => {
    if (!roadmapId) return;
    setStage('loading_debrief');
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/coach/debrief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) { setStage('roleplay'); return; }
      const json = await res.json() as { debrief: Debrief };
      setDebrief(json.debrief);
      setStage('debrief');
    } catch {
      setStage('roleplay');
    } finally {
      bumpMeter();
    }
  }, [roadmapId, bumpMeter]);

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
          The Conversation Coach needs your discovery context to produce useful outputs.
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
        <h1 className="text-lg font-bold text-foreground">Conversation Coach</h1>
      </div>

      <UsageMeter tool="coach" refreshKey={meterRefreshKey} />

      {error && (
        <p className="text-xs text-red-500 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">{error}</p>
      )}

      {stage === 'setup' && roadmapId && (
        <CoachSetupChat
          roadmapId={roadmapId}
          taskId="standalone"
          initialDraft={seedDraft}
          onSetupComplete={(completed) => { void handleSetupComplete(completed); }}
          onCancel={() => { window.location.href = '/tools'; }}
        />
      )}

      {(stage === 'loading_preparation' || stage === 'loading_debrief') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 py-16"
        >
          <Loader2 className="size-6 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            {stage === 'loading_preparation'
              ? 'Generating your preparation package... This takes about 30 seconds.'
              : 'Generating your debrief...'}
          </p>
        </motion.div>
      )}

      {stage === 'preparation' && preparation && (
        <PreparationView
          preparation={preparation}
          channel={setup?.channel ?? 'whatsapp'}
          onStartReplay={() => setStage('roleplay')}
        />
      )}

      {stage === 'roleplay' && roadmapId && (
        <RolePlayChat
          roadmapId={roadmapId}
          taskId="standalone"
          otherPartyName={setup?.who ?? 'The other party'}
          onEnd={() => { void handleRolePlayEnd(); }}
          onToolCallComplete={bumpMeter}
        />
      )}

      {stage === 'debrief' && debrief && (
        <DebriefView
          debrief={debrief}
          onDone={() => setStage('done')}
        />
      )}

      {stage === 'done' && (
        <div className="text-center py-10">
          <p className="text-sm text-foreground mb-3">Your preparation is saved. Good luck with the conversation.</p>
          <Link href="/tools" className="text-sm text-primary hover:underline">
            Back to Tools
          </Link>
        </div>
      )}
    </div>
  );
}
