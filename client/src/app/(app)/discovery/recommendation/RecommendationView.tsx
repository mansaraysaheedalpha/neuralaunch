'use client';
// src/app/(app)/discovery/recommendation/RecommendationView.tsx
//
// Institute orchestrator for the recommendation reveal + pushback.
// Composes the institute/recommendation primitives over the existing
// transports (accept, roadmap, pushback, assumption-check). No pushback
// state is duplicated — round counting derives from the persisted
// history exactly as the legacy PushbackChat did, and a refine/replace
// commit triggers router.refresh() so the server re-loads the updated
// recommendation.

import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { ArrowRight, Loader2, RefreshCcw } from 'lucide-react';
import {
  TopBar,
  Pill,
} from '@/components/institute';
import {
  RecommendationReveal,
  RecReasoning,
  RecSteps,
  RecTimeToResult,
  RecAssumptions,
  RecRisks,
  RecWrong,
  RecAlternatives,
  AcceptBar,
  PushbackRail,
  type PushbackRailHandle,
  type RailTurn,
  type RecRisk,
  type RecAlternative,
} from '@/components/institute/recommendation';
import { TranscriptModal } from '@/components/discovery/standard/TranscriptModal';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';
import { hardCapForTier } from '@/lib/discovery/constants';
import { safeParseAlternatives } from '@/lib/discovery/recommendation-schema';
import type { PushbackTurn, PushbackTurnAgent } from '@/lib/discovery/pushback-types';

interface RecForView {
  id:                          string;
  recommendationType:          string | null;
  summary:                     string;
  path:                        string;
  reasoning:                   string;
  firstThreeSteps:             unknown;
  timeToFirstResult:           string;
  risks:                       unknown;
  assumptions:                 unknown;
  whatWouldMakeThisWrong:      string;
  alternativeRejected:         unknown;
  acceptedAt:                  string | null;
  pushbackHistory:             PushbackTurn[];
  versions:                    { round: number; action: 'refine' | 'replace'; timestamp: string; snapshot: Record<string, unknown> }[];
  alternativeRecommendationId: string | null;
}

interface RecommendationViewProps {
  recommendation: RecForView;
  roadmapReady?: boolean;
  shortId: string;
  /** Optional slot above the reveal (No-Idea cascade banner). */
  headerSlot?: ReactNode;
  /** Optional slot after the anatomy, before the accept bar (No-Idea reserves). */
  footerSlot?: ReactNode;
}

const ACTION_LABEL: Record<PushbackTurnAgent['action'], string> = {
  continue_dialogue: 'Asked',
  defend:            'Defend',
  refine:            'Refine',
  replace:           'Replace',
  closing:           'Closing',
};

export function RecommendationView({
  recommendation: r,
  roadmapReady = false,
  shortId,
  headerSlot,
  footerSlot,
}: RecommendationViewProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const tier = session?.user?.tier ?? 'free';
  const isFreeTier = tier === 'free';
  const maxRounds = hardCapForTier(tier);

  const steps = (r.firstThreeSteps as string[] | null) ?? [];
  const risks = (r.risks as RecRisk[] | null) ?? [];
  const assumptions = (r.assumptions as string[] | null) ?? [];
  const alternatives = safeParseAlternatives(r.alternativeRejected) as RecAlternative[];

  const isAccepted = !!r.acceptedAt;
  const alternativeReady = !!r.alternativeRecommendationId;

  // Pushback local state — optimistic history layered over the
  // persisted initial history (same pattern as the legacy PushbackChat).
  const [history, setHistory] = useState<PushbackTurn[]>(r.pushbackHistory);
  const [pushInput, setPushInput] = useState('');
  const [pushPending, setPushPending] = useState(false);
  const [modeHint, setModeHint] = useState('Phase 1A · Opus + research');
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const railRef = useRef<PushbackRailHandle>(null);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [unaccepting, setUnaccepting] = useState(false);

  const userRounds = history.filter((t) => t.role === 'user').length;
  const capReached = userRounds >= maxRounds || alternativeReady;

  // Build the rail's display turns: a synthetic opening turn + the
  // persisted/optimistic history mapped to the normalised shape.
  const railTurns: RailTurn[] = [
    {
      who: 'NeuraLaunch · Synthesis',
      text:
        'The recommendation here is what I committed to after the interview. If something feels wrong — a fear, an assumption, or a constraint I missed — say so. I will defend where I should, refine where you are right, and replace it entirely if the evidence agrees with you.',
      you: false,
      mode: 'Open',
    },
    ...history.map((t): RailTurn =>
      t.role === 'user'
        ? { who: `You · Round ${t.round}`, text: t.content, you: true }
        : { who: `NeuraLaunch · Round ${t.round}`, text: t.content, you: false, mode: ACTION_LABEL[t.action] },
    ),
  ];

  /* ---- Accept / roadmap ---- */
  async function handleAccept() {
    setAccepting(true);
    setAcceptError(null);
    try {
      const acceptRes = await fetch(`/api/discovery/recommendations/${r.id}/accept`, { method: 'POST' });
      if (!acceptRes.ok) {
        const j = await acceptRes.json().catch(() => ({})) as { error?: string };
        setAcceptError(j.error ?? 'Could not record your acceptance. Please try again.');
        return;
      }
      const roadmapRes = await fetch(`/api/discovery/recommendations/${r.id}/roadmap`, { method: 'POST' });
      if (!roadmapRes.ok) {
        const j = await roadmapRes.json().catch(() => ({})) as { error?: string };
        setAcceptError(j.error ?? 'Roadmap generation could not start. Click again to retry.');
        return;
      }
      router.push(`/discovery/roadmap/${r.id}`);
    } catch {
      setAcceptError('Network error. Please check your connection and try again.');
    } finally {
      setAccepting(false);
    }
  }

  async function handleUnaccept() {
    setUnaccepting(true);
    try {
      const res = await fetch(`/api/discovery/recommendations/${r.id}/accept`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setUnaccepting(false);
    }
  }

  /* ---- Pushback ---- */
  async function handlePushback() {
    const text = pushInput.trim();
    if (!text || pushPending || capReached) return;
    setPushPending(true);
    setModeHint('Phase 1A · Researching…');

    const optimistic: PushbackTurn = {
      role: 'user', content: text, round: userRounds + 1, timestamp: new Date().toISOString(),
    };
    setHistory((prev) => [...prev, optimistic]);
    setPushInput('');

    try {
      const res = await fetch(`/api/discovery/recommendations/${r.id}/pushback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        setHistory((prev) => prev.slice(0, -1));
        setPushInput(text);
        const j = await res.json().catch(() => ({})) as { error?: string };
        toast.error(j.error ?? 'Could not send your message. Please try again.');
        setModeHint('Phase 1A · Opus + research');
        return;
      }
      const data = await res.json() as { agent: PushbackTurnAgent; committed?: boolean; closing?: boolean };
      setHistory((prev) => [...prev, data.agent]);
      setModeHint(`Phase 1B · ${ACTION_LABEL[data.agent.action]} · ready`);

      if (data.committed) {
        // refine/replace mutated the recommendation server-side. Toast
        // the change, then refresh so the anatomy on the left re-renders
        // with the new content.
        toast.success(
          `Recommendation ${data.agent.action === 'replace' ? 'replaced' : 'refined'} · Round ${data.agent.round}`,
          { duration: 3500 },
        );
        router.refresh();
      }
      if (data.closing) router.refresh();
    } catch {
      setHistory((prev) => prev.slice(0, -1));
      setPushInput(text);
      toast.error('Network error — please try again.');
      setModeHint('Phase 1A · Opus + research');
    } finally {
      setPushPending(false);
    }
  }

  /* ---- Assumption "if false" delta — live stream ---- */
  function deltaResolver(assumption: string) {
    return async (onChunk: (acc: string) => void) => {
      const res = await fetch('/api/discovery/assumption-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assumption, path: r.path, reasoning: r.reasoning }),
      });
      if (!res.ok || !res.body) throw new Error('assumption-check failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        onChunk(acc);
      }
    };
  }

  const versionLabel = r.versions.length === 0
    ? 'Original'
    : `Mark ${r.versions.length + 1} of ${r.versions.length + 1}`;

  const transcriptMessages = history.map((t, i) => ({
    id: `${t.round}-${i}`,
    role: t.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: t.content,
  }));

  return (
    <div className="flex h-full flex-col">
      <TopBar
        crumb={[
          { label: 'Discovery', accent: true },
          { label: `Session ${shortId}` },
          { label: 'Recommendation', current: true },
        ]}
        rightStatus={<Pill accent>● Synthesised · Opus 4.6</Pill>}
        rightActions={
          <Link href="/discovery/recommendations" className="text-muted transition-colors hover:text-fg">
            ← Sessions
          </Link>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden min-[1100px]:grid-cols-[1fr_380px]">
        {/* Content */}
        <main className="overflow-y-auto border-r border-rule px-6 py-12 sm:px-12 lg:px-20 lg:pb-28">
          <div className="mx-auto max-w-[980px]">
            {headerSlot}

            <RecommendationReveal
              shortId={shortId}
              pathStamp={`Cycle I · ${formatRecType(r.recommendationType)}`}
              headline={r.path}
              reflection={r.summary}
              versionLabel={versionLabel}
            />

            <RecReasoning reasoning={r.reasoning} />
            {steps.length > 0 && <RecSteps steps={steps} />}
            <RecTimeToResult timeToFirstResult={r.timeToFirstResult} />
            {assumptions.length > 0 && (
              <RecAssumptions assumptions={assumptions} deltaResolver={deltaResolver} />
            )}
            {risks.length > 0 && <RecRisks risks={risks} />}
            <RecWrong wrong={r.whatWouldMakeThisWrong} />
            {alternatives.length > 0 && <RecAlternatives alternatives={alternatives} />}

            {footerSlot}

            {/* Commit zone */}
            {!isAccepted ? (
              <AcceptBar
                onAccept={() => { void handleAccept(); }}
                onPushBack={() => railRef.current?.focusComposer()}
                busy={accepting}
                error={acceptError}
                freeTierSlot={
                  isFreeTier ? (
                    <UpgradePrompt
                      requiredTier="execute"
                      variant="hero"
                      heading="Ready to execute?"
                      description="Your Free tier includes this recommendation and its reasoning. Upgrade to Execute to commit to this path — we'll generate your execution roadmap with Coach, Composer, Research, and Packager unlocked on every task."
                      primaryLabel="Upgrade to Execute"
                    />
                  ) : undefined
                }
              />
            ) : (
              <div
                className="mt-14 flex flex-wrap items-center justify-between gap-4 border border-accent px-7 py-[22px]"
                style={{ background: 'linear-gradient(180deg, rgba(255,90,60,0.10), rgba(255,90,60,0.02))' }}
              >
                <div>
                  <h3 className="font-sans text-[22px] font-medium tracking-[-0.01em] text-fg">
                    {roadmapReady ? 'Your roadmap is ready.' : 'Building your roadmap…'}
                  </h3>
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                    Cycle I · committed
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { void handleUnaccept(); }}
                    disabled={unaccepting}
                    className="inline-flex items-center gap-2 border border-rule-strong px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    <RefreshCcw aria-hidden="true" className={`size-3.5 ${unaccepting ? 'animate-spin' : ''}`} />
                    {unaccepting ? 'Reopening…' : 'Reopen discussion'}
                  </button>
                  <Link
                    href={`/discovery/roadmap/${r.id}`}
                    className="inline-flex items-center gap-3 bg-accent px-[22px] py-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg"
                  >
                    {roadmapReady ? 'View roadmap' : 'Open roadmap'}
                    {roadmapReady
                      ? <ArrowRight aria-hidden="true" className="size-3.5" />
                      : <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Pushback rail */}
        <PushbackRail
          ref={railRef}
          turns={railTurns}
          round={userRounds}
          maxRounds={maxRounds}
          value={pushInput}
          onChange={setPushInput}
          onSubmit={() => { void handlePushback(); }}
          disabled={pushPending || capReached || isFreeTier || isAccepted}
          capReached={capReached}
          modeHint={
            isFreeTier
              ? 'Upgrade to Execute to push back'
              : isAccepted
                ? 'Reopen the discussion to push back'
                : modeHint
          }
          onViewTranscript={() => setTranscriptOpen(true)}
        />
      </div>

      <TranscriptModal
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        messages={transcriptMessages}
      />
    </div>
  );
}

function formatRecType(t: string | null): string {
  if (!t) return 'Path';
  return t
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
