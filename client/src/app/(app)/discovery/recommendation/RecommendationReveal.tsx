// src/app/(app)/discovery/recommendation/RecommendationReveal.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowRight, Loader2 } from 'lucide-react';
import { AssumptionRow } from './AssumptionRow';
import { PUSHBACK_CONFIG } from '@/lib/discovery/constants';
import { PushbackChat } from './PushbackChat';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import type { PushbackTurn } from '@/lib/discovery/pushback-types';
import { safeParseAlternatives } from '@/lib/discovery/recommendation-schema';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';

interface VersionSnapshot {
  round:     number;
  action:    'refine' | 'replace';
  timestamp: string;
  snapshot:  Record<string, unknown>;
}

interface Props {
  recommendation: {
    id:                     string;
    recommendationType:     string | null;
    summary:                string;
    path:                   string;
    reasoning:              string;
    firstThreeSteps:        unknown;
    timeToFirstResult:      string;
    risks:                  unknown;
    assumptions:            unknown;
    whatWouldMakeThisWrong: string;
    alternativeRejected:    unknown;
    createdAt:              Date;
    /** ISO string of acceptance time, or null when not accepted */
    acceptedAt:             string | null;
    /** The pushback transcript so far — empty array when no rounds yet */
    pushbackHistory:        PushbackTurn[];
    /**
     * Prior pre-update snapshots of this recommendation. One row per
     * refine / replace committed during pushback. Empty when the
     * recommendation has never been mutated.
     */
    versions:               VersionSnapshot[];
    /** When set, the round-7 alternative recommendation has been generated */
    alternativeRecommendationId: string | null;
  };
  /** True when a READY roadmap already exists for this recommendation */
  roadmapReady?: boolean;
}

type RiskRow = { risk: string; mitigation: string };

function Section({ label, delay = 0, children }: { label: string; delay?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full group mb-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
          {label}
        </p>
        <ChevronDown className={`size-3.5 text-muted-foreground/50 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * RecommendationReveal
 *
 * Client Component — renders the structured recommendation with:
 * - Always-visible committed summary block at the top
 * - "What Would Make This Wrong" immediately after summary
 * - All remaining sections individually collapsible (expanded by default)
 * - Inline assumption flag with live scoped response (see AssumptionRow)
 */
export function RecommendationReveal({
  recommendation: r,
  roadmapReady = false,
}: Props) {
  const router      = useRouter();
  const { data: session } = useSession();
  const tier = session?.user?.tier ?? 'free';
  const isFreeTier = tier === 'free';
  const steps       = r.firstThreeSteps as string[];
  const risks       = r.risks as RiskRow[];
  const assumptions = r.assumptions as string[];
  const alts = safeParseAlternatives(r.alternativeRejected);
  const [generating,  setGenerating]  = useState(false);
  const [accepting,   setAccepting]   = useState(false);
  const [unaccepting, setUnaccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const isAccepted       = !!r.acceptedAt;
  const alternativeReady = !!r.alternativeRecommendationId;

  async function handleAcceptAndGenerateRoadmap() {
    setAccepting(true);
    setAcceptError(null);
    try {
      // Step 1 — explicit acceptance. Server-side updateMany makes this
      // idempotent, so a retry after a partial failure is safe.
      const acceptRes = await fetch(`/api/discovery/recommendations/${r.id}/accept`, {
        method: 'POST',
      });
      if (!acceptRes.ok) {
        const json = await acceptRes.json().catch(() => ({})) as { error?: string };
        setAcceptError(json.error ?? 'Could not record your acceptance. Please try again.');
        return;
      }

      // Step 2 — fire roadmap generation.
      setGenerating(true);
      const roadmapRes = await fetch(`/api/discovery/recommendations/${r.id}/roadmap`, {
        method: 'POST',
      });
      if (!roadmapRes.ok) {
        const json = await roadmapRes.json().catch(() => ({})) as { error?: string };
        setAcceptError(json.error ?? 'Roadmap generation could not start. Click the button again to retry.');
        return;
      }

      router.refresh();
    } catch {
      setAcceptError('Network error. Please check your connection and try again.');
    } finally {
      setAccepting(false);
      setGenerating(false);
    }
  }

  async function handleUnaccept() {
    setUnaccepting(true);
    try {
      const res = await fetch(`/api/discovery/recommendations/${r.id}/accept`, {
        method: 'DELETE',
      });
      if (res.ok) router.refresh();
    } finally {
      setUnaccepting(false);
    }
  }

  // Refresh hook called by the pushback chat after a refine/replace commit
  function handlePushbackCommit() {
    router.refresh();
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">

        {r.summary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-5"
          >
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gold">Your Recommendation</p>
            <p className="text-body text-foreground">{r.summary}</p>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-2">What Would Make This Wrong</p>
          <p className="text-body text-foreground">{r.whatWouldMakeThisWrong}</p>
        </motion.div>

        <Section label="Your Path" delay={0.3}>
          <h2 className="text-xl font-semibold text-foreground leading-snug">{r.path}</h2>
        </Section>

        <Section label="Why This Fits You" delay={0.4}>
          <p className="text-sm text-foreground/90 leading-relaxed">{r.reasoning}</p>
        </Section>

        <Section label="First Three Steps" delay={0.5}>
          <ol className="flex flex-col gap-3 list-decimal list-inside">
            {steps.map((step, i) => (
              <li key={i} className="text-sm text-foreground/90 leading-relaxed pl-1">
                {step}
              </li>
            ))}
          </ol>
        </Section>

        <Section label="Time to First Result" delay={0.6}>
          <p className="text-sm font-medium text-foreground">{r.timeToFirstResult}</p>
        </Section>

        <Section label="Risks & Mitigations" delay={0.7}>
          <div className="flex flex-col gap-3">
            {risks.map((row, i) => (
              <div key={i} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium text-foreground mb-1">{row.risk}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">{row.mitigation}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Assumptions" delay={0.8}>
          <ul className="flex flex-col gap-2">
            {assumptions.map((a, i) => (
              <AssumptionRow key={i} text={a} path={r.path} reasoning={r.reasoning} />
            ))}
          </ul>
        </Section>

        <Section label={alts.length > 1 ? 'Alternatives Considered & Rejected' : 'Alternative Considered & Rejected'} delay={0.9}>
          <div className="flex flex-col gap-3">
            {alts.map((alt, i) => (
              <div key={i} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium text-foreground mb-1">{alt.alternative}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">{alt.whyNotForThem}</p>
              </div>
            ))}
          </div>
        </Section>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="pt-4 border-t border-border flex flex-col gap-6"
        >
          {/* Roadmap CTA — three states. The gate is acceptance AND
              roadmap readiness is a separate concern. The roadmap
              warm-up was removed in the prod-readiness fixes — the
              roadmap now only starts building after the founder
              clicks "This is my path — build my roadmap" so the
              artefact always reflects the recommendation as committed
              at acceptance time (post-pushback refinements included).

              State A — !isAccepted: show the explicit accept-and-build
                       button. Clicking it commits acceptedAt and fires
                       the roadmap POST (which triggers Inngest).
              State B — isAccepted && roadmapReady: roadmap has finished
                       building (typically 30–60s after acceptance);
                       show the View link.
              State C — isAccepted && !roadmapReady: Inngest is still
                       building the roadmap. Show a building placeholder. */}
          <div>
            {isFreeTier && !isAccepted ? (
              <UpgradePrompt
                requiredTier="execute"
                variant="hero"
                heading="Ready to execute?"
                description="Your Free tier includes this recommendation and its reasoning. Upgrade to Execute to commit to this path — we'll generate your execution roadmap with Coach, Composer, Research, and Packager unlocked on every task."
                primaryLabel="Upgrade to Execute"
              />
            ) : !isAccepted ? (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  When you are ready to commit to this path, click below. This is the moment of
                  acceptance — your roadmap will be generated immediately.
                </p>
                <button
                  onClick={() => { void handleAcceptAndGenerateRoadmap(); }}
                  disabled={accepting || generating}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {(accepting || generating) ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  {accepting
                    ? 'Committing…'
                    : generating
                      ? 'Building your roadmap…'
                      : 'This is my path — build my roadmap'}
                </button>
                {acceptError && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-400">
                    {acceptError}
                  </div>
                )}
              </>
            ) : roadmapReady ? (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  You committed to this path. Your downstream tools are ready below.
                </p>
                <Link
                  href={`/discovery/roadmap/${r.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <ArrowRight className="size-4" />
                  View My Execution Roadmap
                </Link>
                <button
                  type="button"
                  onClick={() => { void handleUnaccept(); }}
                  disabled={unaccepting}
                  className="mt-4 block text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                >
                  {unaccepting ? 'Reopening…' : 'Reopen the discussion (un-accept)'}
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  Building your roadmap…
                </p>
                <button
                  type="button"
                  onClick={() => { void handleUnaccept(); }}
                  disabled={unaccepting}
                  className="mt-1 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                >
                  {unaccepting ? 'Reopening…' : 'Reopen the discussion (un-accept)'}
                </button>
              </>
            )}
          </div>

          {/* Pushback chat — available until the founder has explicitly
              accepted the recommendation. The warm-up roadmap no
              longer exists (removed as part of the prod-readiness
              fixes), so roadmapReady will only be true post-accept-
              and-regen. Gating pushback on roadmapReady would be
              redundant — acceptance is the canonical "discussion is
              closed" signal. */}
          {!isAccepted && !isFreeTier && (
            <div>
              <PushbackChat
                recommendationId={r.id}
                initialHistory={r.pushbackHistory}
                hardCapRound={PUSHBACK_CONFIG.HARD_CAP_ROUND}
                alternativeReady={alternativeReady}
                accepted={isAccepted}
                onCommit={handlePushbackCommit}
              />
            </div>
          )}

          {/* Prior versions — only rendered when the recommendation has
              actually been mutated by a refine/replace. The panel is a
              single collapsed row by default so it never dominates the
              page; founders who want to see what changed click in. */}
          {r.versions.length > 0 && !isFreeTier && (
            <VersionHistoryPanel versions={r.versions} />
          )}

          {/* Alternative recommendation surfacing — when the round-7
              alternative is ready, point the founder at it. */}
          {alternativeReady && r.alternativeRecommendationId && (
            <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
              <p className="text-[10px] uppercase tracking-widest text-gold mb-2">
                Alternative ready
              </p>
              <p className="text-xs text-foreground leading-relaxed mb-3">
                I generated the alternative path you argued for so you can compare both side-by-side.
              </p>
              <Link
                href={`/discovery/recommendations/${r.alternativeRecommendationId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-medium text-gold transition-opacity hover:opacity-80"
              >
                <ArrowRight className="size-3.5" />
                View the alternative recommendation
              </Link>
            </div>
          )}

        </motion.div>

      </div>
    </div>
  );
}
