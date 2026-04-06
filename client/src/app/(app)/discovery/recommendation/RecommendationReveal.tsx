// src/app/(app)/discovery/recommendation/RecommendationReveal.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowRight, Loader2 } from 'lucide-react';
import { AssumptionRow } from './AssumptionRow';
import {
  VALIDATION_PAGE_ELIGIBLE_TYPES,
  PUSHBACK_CONFIG,
  type RecommendationType,
} from '@/lib/discovery/constants';
import { PushbackChat } from './PushbackChat';

// Match the JSON shape persisted in Recommendation.pushbackHistory
interface PushbackTurnLite {
  role:      'user' | 'agent';
  content:   string;
  round:     number;
  mode?:     string;
  action?:   string;
  converging?: boolean;
  timestamp: string;
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
    pushbackHistory:        PushbackTurnLite[];
    /** When set, the round-7 alternative recommendation has been generated */
    alternativeRecommendationId: string | null;
  };
  /** True when a READY roadmap already exists for this recommendation */
  roadmapReady?: boolean;
  /** Set when a validation page has been generated — pageId for navigation */
  validationPageId?: string | null;
  /**
   * Signal strength of any prior validation report. When 'negative', the
   * "Build Validation Page" CTA must stay hidden — the market already
   * answered this recommendation and we do not let the founder rebuild a
   * landing page for a discredited direction.
   */
  validationSignalStrength?: string | null;
}

type RiskRow = { risk: string; mitigation: string };
type AltRow  = { alternative: string; whyNotForThem: string };

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
  validationPageId = null,
  validationSignalStrength = null,
}: Props) {
  const router      = useRouter();
  const steps       = r.firstThreeSteps as string[];
  const risks       = r.risks as RiskRow[];
  const assumptions = r.assumptions as string[];
  const alt         = r.alternativeRejected as AltRow;
  const [generating,         setGenerating]         = useState(false);
  const [creatingValidation, setCreatingValidation] = useState(false);
  const [accepting,          setAccepting]          = useState(false);
  const [unaccepting,        setUnaccepting]        = useState(false);

  const isAccepted       = !!r.acceptedAt;
  const alternativeReady = !!r.alternativeRecommendationId;

  // Validation page eligibility — gated on:
  //   1. The recommendation's action shape is one we have a validation
  //      page mechanic for (currently only build_software)
  //   2. There is no prior validation report for this recommendation that
  //      came back as a negative signal — once the market has said no, we
  //      do not let the founder rebuild a landing page for that direction
  const validationPageApplicable =
    r.recommendationType !== null
    && VALIDATION_PAGE_ELIGIBLE_TYPES.has(r.recommendationType as RecommendationType)
    && validationSignalStrength !== 'negative';

  async function handleAcceptAndGenerateRoadmap() {
    setAccepting(true);
    try {
      // Step 1 — explicit acceptance
      const acceptRes = await fetch(`/api/discovery/recommendations/${r.id}/accept`, {
        method: 'POST',
      });
      if (!acceptRes.ok) return;

      // Step 2 — generate the roadmap (only after acceptance)
      setGenerating(true);
      const roadmapRes = await fetch(`/api/discovery/recommendations/${r.id}/roadmap`, {
        method: 'POST',
      });
      if (roadmapRes.ok) {
        router.push(`/discovery/roadmap/${r.id}`);
      }
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

  async function handleCreateValidationPage() {
    setCreatingValidation(true);
    try {
      const res = await fetch(`/api/discovery/recommendations/${r.id}/validation-page`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json() as { pageId: string };
        router.push(`/discovery/validation/${json.pageId}`);
      }
    } finally {
      setCreatingValidation(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">

        {r.summary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70 mb-2">Your Recommendation</p>
            <p className="text-sm text-foreground leading-relaxed">{r.summary}</p>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-2">What Would Make This Wrong</p>
          <p className="text-sm text-foreground/80 leading-relaxed italic">{r.whatWouldMakeThisWrong}</p>
        </motion.div>

        <Section label="Your Path" delay={0.3}>
          <h2 className="text-xl font-semibold text-foreground leading-snug">{r.path}</h2>
        </Section>

        <Section label="Why This Fits You" delay={0.4}>
          <p className="text-sm text-foreground/90 leading-relaxed">{r.reasoning}</p>
        </Section>

        <Section label="First Three Steps" delay={0.5}>
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
                  {i + 1}
                </span>
                <span className="text-foreground/90 leading-relaxed pt-0.5">{step}</span>
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

        <Section label="Alternative Considered & Rejected" delay={0.9}>
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium text-foreground mb-1">{alt.alternative}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">{alt.whyNotForThem}</p>
          </div>
        </Section>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="pt-4 border-t border-border flex flex-col gap-6"
        >
          {/* Roadmap CTA — accept-and-generate combined into a single
              ceremonial moment. Clicking this button is the explicit
              act of acceptance AND it triggers roadmap generation. The
              two-step server-side flow (POST /accept then POST /roadmap)
              keeps the data model honest: the founder always commits
              before the roadmap is built. */}
          <div>
            {roadmapReady ? (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Your execution roadmap is ready.
                </p>
                <Link
                  href={`/discovery/roadmap/${r.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <ArrowRight className="size-4" />
                  View My Execution Roadmap
                </Link>
              </>
            ) : (
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
                {isAccepted && (
                  <button
                    type="button"
                    onClick={() => { void handleUnaccept(); }}
                    disabled={unaccepting}
                    className="mt-2 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                  >
                    {unaccepting ? 'Reopening…' : 'Reopen the discussion (un-accept)'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Pushback chat — always available unless the roadmap has
              already been generated (at which point the discussion is
              effectively closed because acceptance is locked in). */}
          {!roadmapReady && (
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

          {/* Alternative recommendation surfacing — when the round-7
              alternative is ready, point the founder at it. */}
          {alternativeReady && r.alternativeRecommendationId && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">
                Alternative ready
              </p>
              <p className="text-xs text-foreground leading-relaxed mb-3">
                I generated the alternative path you argued for so you can compare both side-by-side.
              </p>
              <Link
                href={`/discovery/recommendations/${r.alternativeRecommendationId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 transition-opacity hover:opacity-80"
              >
                <ArrowRight className="size-3.5" />
                View the alternative recommendation
              </Link>
            </div>
          )}

          {/* Validation page CTA — only shown when:
              - the recommendation is a build_software type (gated by recommendationType)
              - the roadmap is READY
              - no prior validation report has come back negative
              For non-software recommendations the founder simply does not
              see this section — the validation page mechanic does not apply. */}
          {roadmapReady && validationPageApplicable && (
            <div className="pt-4 border-t border-border">
              {validationPageId ? (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Your validation landing page is ready to preview.
                  </p>
                  <Link
                    href={`/discovery/validation/${validationPageId}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-opacity hover:opacity-80"
                  >
                    <ArrowRight className="size-4" />
                    View Validation Page
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    Build a landing page to test your idea with real users and collect interest signals.
                  </p>
                  <button
                    onClick={() => { void handleCreateValidationPage(); }}
                    disabled={creatingValidation}
                    className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-opacity hover:opacity-80 disabled:opacity-50"
                  >
                    {creatingValidation ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    {creatingValidation ? 'Building…' : 'Build Validation Page'}
                  </button>
                </>
              )}
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
