// src/app/(app)/discovery/recommendation/RecommendationReveal.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown,
  ArrowRight,
  Loader2,
  AlertTriangle,
  Compass,
  Clock,
  Shield,
  ListChecks,
  X as XIcon,
  RefreshCcw,
} from 'lucide-react';
import { AssumptionRow } from './AssumptionRow';
import { hardCapForTier } from '@/lib/discovery/constants';
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

/**
 * Section
 *
 * Collapsible section with tiered visual hierarchy:
 *   - tier="primary"   — gold eyebrow + icon, used for the path + steps moments
 *   - tier="secondary" — slate eyebrow + icon, used for reasoning / risks / time
 *   - tier="tertiary"  — muted eyebrow, used for assumptions / alternatives
 *
 * The previous flat `text-muted-foreground/70` made everything read at the
 * same weight. Tiering communicates "this section matters more" without
 * adding new sections or removing any.
 */
function Section({
  label,
  delay = 0,
  tier = 'secondary',
  icon: Icon,
  children,
}: {
  label:    string;
  delay?:   number;
  tier?:    'primary' | 'secondary' | 'tertiary';
  icon?:    typeof Compass;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const eyebrowClass =
    tier === 'primary'   ? 'text-gold'
    : tier === 'tertiary' ? 'text-muted-foreground/55'
    :                       'text-muted-foreground/85';
  const iconClass =
    tier === 'primary' ? 'text-gold' : 'text-muted-foreground/70';
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.3, ease: 'easeOut' }}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full group mb-3">
        <p className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${eyebrowClass}`}>
          {Icon && <Icon className={`size-3.5 ${iconClass}`} aria-hidden="true" />}
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

      // Step 3 — navigate to the roadmap viewer. The viewer polls the
      // GET endpoint and renders its own build-in-progress UI that
      // flips to the full roadmap when status transitions to READY.
      // Previously we did router.refresh() here, which re-rendered the
      // recommendation page with a frozen "Building your roadmap…"
      // placeholder — no polling, no auto-navigation, forcing the
      // founder to manually browse to My Ventures and click through.
      router.push(`/discovery/roadmap/${r.id}`);
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

  // Version mark — "Original" until the recommendation has been refined
  // or replaced via pushback, then "Mark N of N" so the founder always
  // knows which iteration they're reading. The version pill sits above
  // the recommendation card so it anchors the moment without dominating.
  const totalMarks = r.versions.length + 1;
  const versionLabel = r.versions.length === 0
    ? 'Recommendation · Original'
    : `Recommendation · Mark ${totalMarks} of ${totalMarks}`;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Subtle backdrop — radial primary glow + masked grid behind the
          page content. Anchors the moment visually so the recommendation
          doesn't float in a flat dark canvas. Decorative; pointer-events
          disabled. Mirrors the empty-state backdrop on /discovery so a
          user moving from interview to recommendation feels they're in
          the same product, just one step deeper. */}
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute inset-x-0 top-0 mx-auto h-[480px] max-w-3xl bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.10),_transparent_60%)]" />
          <div className="absolute inset-0 opacity-[0.30] [background-image:linear-gradient(to_right,hsl(var(--border)/0.55)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.55)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_85%)]" />
        </div>

        <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">

        {/* Version mark pill — small contextual marker so the founder
            knows whether they're reading the original recommendation or
            a refined version. Always rendered (even on Original) so the
            visual anchor is consistent across versions. */}
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="self-center inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold"
        >
          <Compass className="size-3" aria-hidden="true" />
          {versionLabel}
        </motion.p>

        {/* Top-of-page paired cards — the recommendation (commit) and
            its falsification (counterweight). Rendering them as a
            two-card composition rather than recommendation + bare-text-
            falsification gives the falsification its proper weight as
            the brand differentiator ("Honest falsification — what would
            make this wrong" is the bullet sold on the marketing card). */}
        {r.summary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.4, ease: 'easeOut' }}
            className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-5 shadow-lg shadow-black/20"
          >
            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
              <ArrowRight className="size-3" aria-hidden="true" />
              Your Recommendation
            </p>
            <p className="text-body text-foreground">{r.summary}</p>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.10, duration: 0.4, ease: 'easeOut' }}
          className="rounded-xl border border-gold/20 bg-gold/[0.03] px-6 py-5"
        >
          <p className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/90">
            <AlertTriangle className="size-3" aria-hidden="true" />
            What Would Make This Wrong
          </p>
          <p className="text-body text-foreground/95">{r.whatWouldMakeThisWrong}</p>
        </motion.div>

        {/* Path — wrapped in a card with a primary left-rail accent so it
            reads as the directional commitment, not just a heading. */}
        <Section label="Your Path" delay={0.16} tier="primary" icon={Compass}>
          <div className="rounded-xl border border-border bg-card/50 px-5 py-4 border-l-[3px] border-l-primary">
            <h2 className="text-xl font-semibold text-foreground leading-snug">{r.path}</h2>
          </div>
        </Section>

        <Section label="Why This Fits You" delay={0.20} tier="secondary">
          <p className="text-sm text-foreground/90 leading-relaxed">{r.reasoning}</p>
        </Section>

        {/* Steps — numbered tile-badges in primary tint instead of bare
            list-decimal list-inside. Each step gets visual weight + a
            consistent left-edge alignment so the eye reads the sequence
            as a deliberate three-step plan, not a markdown list. */}
        <Section label="First Three Steps" delay={0.24} tier="primary" icon={ListChecks}>
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-foreground/90 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section label="Time to First Result" delay={0.28} tier="secondary" icon={Clock}>
          <p className="text-sm font-medium text-foreground">{r.timeToFirstResult}</p>
        </Section>

        <Section label="Risks & Mitigations" delay={0.32} tier="secondary" icon={Shield}>
          <div className="flex flex-col gap-3">
            {risks.map((row, i) => (
              <div key={i} className="rounded-lg border border-border bg-card/50 px-4 py-3 text-sm">
                <p className="font-medium text-foreground mb-1">{row.risk}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">{row.mitigation}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Assumptions" delay={0.36} tier="tertiary">
          <ul className="flex flex-col gap-2">
            {assumptions.map((a, i) => (
              <AssumptionRow key={i} text={a} path={r.path} reasoning={r.reasoning} />
            ))}
          </ul>
        </Section>

        {/* Alternative — slate tint + "✗ Rejected" tag so the visual
            verdict is felt at a glance without reading the eyebrow.
            Border-l-slate accent on each card mirrors the primary
            left-rail on the Path card (commit) → opposite signal. */}
        <Section
          label={alts.length > 1 ? 'Alternatives Considered & Rejected' : 'Alternative Considered & Rejected'}
          delay={0.40}
          tier="tertiary"
          icon={XIcon}
        >
          <div className="flex flex-col gap-3">
            {alts.map((alt, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/40 border-l-[3px] border-l-muted-foreground/40 px-4 py-3 text-sm">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <XIcon className="size-2.5" aria-hidden="true" />
                    Rejected
                  </span>
                  <p className="font-medium text-foreground/85">{alt.alternative}</p>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">{alt.whyNotForThem}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* CTA band — the climax of the page. Wrapped in a card with
            faint primary-tinted border + glow shadow so the roadmap
            button reads as a deliberate moment after the long scroll
            of sections, not just one more entry in the stack. The
            Reopen-discussion link inside the band is now an outlined
            button with a RefreshCcw icon — visible without dominating. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.46, duration: 0.4, ease: 'easeOut' }}
          className="rounded-xl border border-primary/25 bg-primary/[0.04] p-6 shadow-lg shadow-primary/5 flex flex-col gap-6"
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
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-50"
                >
                  <RefreshCcw className={`size-3 ${unaccepting ? 'animate-spin' : ''}`} aria-hidden="true" />
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
                  className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-50"
                >
                  <RefreshCcw className={`size-3 ${unaccepting ? 'animate-spin' : ''}`} aria-hidden="true" />
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
                hardCapRound={hardCapForTier(tier)}
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
    </div>
  );
}
