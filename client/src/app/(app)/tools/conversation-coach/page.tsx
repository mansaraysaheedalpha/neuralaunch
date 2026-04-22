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
import type { ConversationSetup, PreparationPackage, Debrief, CoachSession } from '@/lib/roadmap/coach';
import {
  readPackagerHandoffParams,
  fetchPackagerHandoff,
  buildCoachSeedMessage,
} from '@/app/(app)/tools/packager-handoff';
import {
  readComposerHandoffParams,
  fetchComposerHandoff,
  buildCoachSeedFromComposerMessage,
} from '@/app/(app)/tools/composer-handoff';
import { UsageMeter } from '@/components/billing/UsageMeter';

type Stage = 'loading' | 'no_roadmap' | 'setup' | 'loading_preparation' | 'preparation' | 'roleplay' | 'loading_debrief' | 'debrief' | 'done';

export default function StandaloneCoachPage() {
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const [stage, setStage]         = useState<Stage>('loading');
  const [setup, setSetup]         = useState<ConversationSetup | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [preparation, setPrep]    = useState<PreparationPackage | null>(null);
  const [debrief, setDebrief]     = useState<Debrief | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState<string | undefined>(undefined);
  const [meterRefreshKey, setMeterRefreshKey] = useState(0);
  const bumpMeter = useCallback(() => {
    setMeterRefreshKey(k => k + 1);
  }, []);

  // Auto-detect the most recent roadmap, any inbound packager handoff,
  // and (on refresh) a sessionId query param for restoring a prior
  // setup → preparation → roleplay → debrief progression.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/discovery/roadmaps/has-any');
        if (!res.ok) { setStage('no_roadmap'); return; }
        const json = await res.json() as { hasRoadmap: boolean; roadmapId?: string };
        if (!json.hasRoadmap || !json.roadmapId) { setStage('no_roadmap'); return; }
        setRoadmapId(json.roadmapId);

        if (typeof window !== 'undefined') {
          const urlSessionId = new URLSearchParams(window.location.search).get('sessionId');
          if (urlSessionId) {
            try {
              const sRes = await fetch(
                `/api/discovery/roadmaps/${json.roadmapId}/coach/sessions/${urlSessionId}`,
              );
              if (sRes.ok) {
                const sJson = await sRes.json() as { session: CoachSession };
                setSessionId(urlSessionId);
                setSetup(sJson.session.setup);
                if (sJson.session.debrief) {
                  setDebrief(sJson.session.debrief);
                  setStage('debrief');
                  return;
                }
                if (sJson.session.rolePlayHistory && sJson.session.rolePlayHistory.length > 0) {
                  if (sJson.session.preparation) setPrep(sJson.session.preparation);
                  setStage('roleplay');
                  return;
                }
                if (sJson.session.preparation) {
                  setPrep(sJson.session.preparation);
                  setStage('preparation');
                  return;
                }
                // Setup present but nothing else yet — jump the
                // founder back to the preparation loading view so
                // the next click resumes cleanly.
                setStage('setup');
                return;
              }
            } catch { /* fall through to fresh start */ }
          }
        }

        // Composer → Coach handoff takes priority over Packager →
        // Coach: if the founder clicked "Prepare for this conversation"
        // on a drafted outreach message, the rehearsal should anchor
        // on THAT specific message and its recipient, not on whatever
        // service package they packaged earlier.
        const composerHandoffParams = readComposerHandoffParams();
        if (composerHandoffParams) {
          const handoff = await fetchComposerHandoff(
            composerHandoffParams.roadmapId,
            composerHandoffParams.sessionId,
            composerHandoffParams.messageId,
          );
          if (handoff) {
            setSeedDraft(buildCoachSeedFromComposerMessage(handoff));
          }
        } else {
          // Packager → Coach handoff (unchanged legacy path).
          const handoffParams = readPackagerHandoffParams();
          if (handoffParams) {
            const handoff = await fetchPackagerHandoff(handoffParams.roadmapId, handoffParams.sessionId);
            if (handoff) setSeedDraft(buildCoachSeedMessage(handoff));
          }
        }

        setStage('setup');
      } catch {
        setStage('no_roadmap');
      }
    })();
  }, []);

  const handleSetupComplete = useCallback(async (
    completed: ConversationSetup,
    setupSessionId?: string,
  ) => {
    if (!roadmapId || !setupSessionId) {
      // Without a sessionId the standalone prepare/debrief routes
      // have no way to address the coach session that setup just
      // persisted — surfacing this explicitly beats a silent 400.
      setError('Setup completed but no session was returned.');
      return;
    }
    setSetup(completed);
    setSessionId(setupSessionId);
    setStage('loading_preparation');
    setError(null);

    // Push sessionId into the URL so a refresh during preparation
    // or roleplay lands back on the right stage via the restore
    // branch in useEffect above.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('sessionId', setupSessionId);
      window.history.replaceState({}, '', url.toString());
    }

    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/coach/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: setupSessionId }),
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
    if (!roadmapId || !sessionId) return;
    setStage('loading_debrief');
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/coach/debrief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
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
  }, [roadmapId, sessionId, bumpMeter]);

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
          standalone
          initialDraft={seedDraft}
          onSetupComplete={(completed, sid) => { void handleSetupComplete(completed, sid); }}
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

      {stage === 'roleplay' && roadmapId && sessionId && (
        <RolePlayChat
          roadmapId={roadmapId}
          taskId="standalone"
          standalone
          sessionId={sessionId}
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
