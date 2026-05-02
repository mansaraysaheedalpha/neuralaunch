'use client';
// src/app/(app)/discovery/roadmap/[id]/RoadmapView.tsx

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Loader2, Lock, Compass, Flag } from 'lucide-react';
import { OutcomeForm } from '@/components/outcome/OutcomeForm';
import { useRoadmapPolling } from './useRoadmapPolling';
import { PhaseBlock } from './PhaseBlock';
import { PhaseRail } from './PhaseRail';
import { WhatsNextPanel } from './WhatsNextPanel';
import { ParkingLotInline } from './ParkingLotInline';
import { NudgeBanner } from './NudgeBanner';
import { RoadmapProgressHeader } from './RoadmapProgressHeader';
import {
  RoadmapWritabilityProvider,
  type ReadOnlyReason,
} from './RoadmapWritabilityContext';

/**
 * RoadmapView
 *
 * Slim orchestrator for the roadmap viewer. Polls via
 * useRoadmapPolling, renders one PhaseBlock per phase, and surfaces
 * three banners on top:
 *   - the proactive nudge banner (set by the daily Inngest sweep)
 *   - the STALE-roadmap regenerate banner
 *   - the closing thought card
 * Plus the Concern 5 outcome capture form at the bottom.
 *
 * The interactive task UI lives in InteractiveTaskCard, the per-phase
 * shell lives in PhaseBlock, and the polling state machine lives in
 * useRoadmapPolling. Each module is independently auditable and the
 * orchestrator stays under the CLAUDE.md component cap.
 */
export function RoadmapView({
  recommendationId,
  founderGoal,
  writable,
  readOnlyReason,
}: {
  recommendationId: string;
  founderGoal:      string | null;
  writable:         boolean;
  readOnlyReason:   ReadOnlyReason | null;
}) {
  const { data, loading, failed, regenerating, regenerate } = useRoadmapPolling(recommendationId);

  // Concern 5 — outcome form visibility. Two independent triggers:
  //   1. A status PATCH returns outcomePromptDue → sets manualTrigger
  //   2. data.progress.outcomePromptPending is true on poll
  // The form is shown when EITHER source fires AND the founder has
  // not yet dismissed it via onDone. Derived state — no useEffect
  // needed, which satisfies the React 19 set-state-in-effect lint rule.
  const [manualOutcomeTrigger, setManualOutcomeTrigger] = useState(false);
  const [outcomeDismissed, setOutcomeDismissed]         = useState(false);
  // Selected phase — null until the first poll completes; once data
  // is in we initialize to the founder's "current" phase (first
  // incomplete) so they land on what they were last working in. The
  // user can then click any rail entry to view that phase's tasks.
  // Null sentinel + lazy initialization keeps the order clean: we
  // can't compute activePhase until data arrives.
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const outcomePromptVisible =
    !outcomeDismissed
    && (manualOutcomeTrigger || !!data?.progress?.outcomePromptPending);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Building your execution roadmap…</p>
        
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="text-sm text-muted-foreground">Something went wrong generating your roadmap.</p>
        <p className="text-xs text-muted-foreground/60">Please try again from your recommendation page.</p>
      </div>
    );
  }

  const phaseProgress = data.progress
    ? { totalTasks: data.progress.totalTasks, completedTasks: data.progress.completedTasks }
    : null;

  // Cumulative phase week ranges. Each phase carries a single
  // durationWeeks number; the rail wants to show "WEEKS 4-5" for
  // phase 2 when phase 1 was 3 weeks. Computed once here and passed
  // down so PhaseRail stays presentational. Implemented as a reduce
  // (rather than a let-cursor + map) to satisfy the React 19
  // react-hooks/immutability lint rule, which forbids reassigning
  // a variable across render-time iterations.
  const phaseRanges = data.phases.reduce<Array<{ phase: number; startWeek: number; endWeek: number }>>((acc, p) => {
    const dur   = Math.max(1, p.durationWeeks ?? 1);
    const start = acc.length === 0 ? 1 : acc[acc.length - 1].endWeek + 1;
    const end   = start + dur - 1;
    return [...acc, { phase: p.phase, startWeek: start, endWeek: end }];
  }, []);

  // Active phase = first phase with at least one not-yet-completed
  // task. Falls back to the last phase when everything is done so the
  // PhaseRail still has something to mark as the founder's position.
  const activePhase =
    (data.phases.findIndex(p =>
      (p.tasks as Array<{ status?: string }>).some(t => t.status !== 'completed'),
    ) + 1) || data.phases.length;

  // Effective selected phase — falls back to activePhase until the
  // founder explicitly clicks a rail entry. After they click, their
  // selection persists (selectedPhase state). If their selection
  // becomes invalid (e.g. data refetch returned fewer phases),
  // collapse back to activePhase.
  const effectiveSelectedPhase =
    selectedPhase != null && data.phases.some(p => p.phase === selectedPhase)
      ? selectedPhase
      : activePhase;
  const visiblePhase = data.phases.find(p => p.phase === effectiveSelectedPhase) ?? data.phases[0];
  const visiblePhaseIndex = data.phases.findIndex(p => p.phase === effectiveSelectedPhase);

  return (
    <RoadmapWritabilityProvider writable={writable} readOnlyReason={readOnlyReason}>
    <div className="relative">
      {/* Subtle backdrop — same radial primary glow + masked grid we
          ship on /discovery and /recommendation, so a paying user
          living inside this page for weeks of execution feels they're
          inside a finished product, not a wireframe. Decorative only;
          pointer-events disabled. Now spans the full canvas width
          since the layout dropped the constrained reading column. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        {/* Top radial glow — primary-blue at 22% fading to ~6% per
            the design-tool spec, brightened from the prior 16/4
            stops so the workspace environment lights up enough to
            feel like an active surface (was reading too subtle).
            Anchors the eye on the title + progress band; the canvas
            now carries ALL the workspace lighting since the per-phase
            ambient was removed. */}
        <div className="absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.22),_hsl(var(--primary)/0.06)_55%,transparent_80%)]" />
        {/* Geometric grid — slate-800 at 55% per spec, with a radial
            mask so the lines fade out toward the edges. */}
        <div className="absolute inset-0 opacity-[0.40] [background-image:linear-gradient(to_right,hsl(var(--border)/0.55)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.55)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_90%)]" />
      </div>

      {/* Title bar — full canvas width, scrolls away normally.
          Padding tightens at sm so the title isn't pushed off-canvas
          on a 375px viewport. Title clamps to text-2xl on sm so the
          30px desktop size doesn't eat half the viewport width. */}
      <div className="px-4 sm:px-6 lg:px-10 pt-6 sm:pt-10 pb-5 sm:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-start gap-3"
        >
          {data.totalWeeks && data.weeklyHours && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
              <Compass className="size-3" aria-hidden="true" />
              Execution · {data.totalWeeks} week{data.totalWeeks !== 1 ? 's' : ''} · {data.weeklyHours}h/week
            </span>
          )}
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Your Execution Roadmap</h1>
        </motion.div>
      </div>

      {/* Top-level read-only banner — full canvas width, surfaced
          ABOVE the progress band when the venture is paused,
          completed, or archived. Tells the founder *before* they try
          anything why every interactive surface below is disabled. */}
      {!writable && readOnlyReason && (
        <div className="px-4 sm:px-6 lg:px-10 pb-4">
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3"
          >
            <Lock className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5">
              <p className="text-[12px] font-semibold text-foreground">
                {readOnlyReason === 'paused'    && 'This venture is paused — read-only'}
                {readOnlyReason === 'completed' && 'This venture is complete — read-only'}
                {readOnlyReason === 'archived'  && 'This venture is archived — read-only'}
              </p>
              <p className="text-[11px] text-foreground/80 leading-relaxed">
                {readOnlyReason === 'paused' && 'You can read the roadmap, recommendation, and prior cycles. Check-ins, tools, status changes, and What’s Next are disabled until you resume.'}
                {readOnlyReason === 'completed' && 'Completed is terminal. The roadmap and recommendation stay readable forever, but no new check-ins, tool runs, or status changes will land. Start a new venture to continue working.'}
                {readOnlyReason === 'archived' && 'Tier downgrade auto-archived this venture. It stays readable; new actions resume after you restore it.'}
              </p>
              <Link
                href="/discovery/recommendations"
                className="self-start text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 underline underline-offset-2"
              >
                Open Sessions tab →
              </Link>
            </div>
          </motion.div>
        </div>
      )}

      {/* Sticky horizontal progress band — full canvas width, the only
          always-glanced element on the page. Replaces the prior
          280px right-rail "Cycle progress" idea so the work surface
          below can stretch to its natural width. */}
      {data.progress && (
        <div className="sticky top-0 z-20 px-4 sm:px-6 lg:px-10 bg-background/95 backdrop-blur-md border-b border-border">
          <RoadmapProgressHeader
            totalTasks={data.progress.totalTasks}
            completedTasks={data.progress.completedTasks}
            blockedTasks={data.progress.blockedTasks ?? 0}
            totalPhases={data.phases.length}
            currentPhase={activePhase}
            totalWeeks={data.totalWeeks ?? null}
          />
        </div>
      )}

      {/* Proactive nudge + STALE banners — full-width below the
          progress band. */}
      <div className="px-4 sm:px-6 lg:px-10 pt-6 flex flex-col gap-4">
        {data.progress?.nudgePending && (
          <NudgeBanner
            phases={data.phases}
            staleTaskTitle={data.progress?.staleTaskTitle ?? null}
          />
        )}

        {data.status === 'STALE' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 flex flex-col gap-3"
          >
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gold mb-1">
                Out of date
              </p>
              <p className="text-xs text-foreground leading-relaxed">
                Your recommendation was updated through pushback after this roadmap was generated.
                The steps below reflect the older version. Regenerate to get a roadmap that matches
                your current recommendation.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void regenerate(); }}
              disabled={regenerating}
              className="self-start flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {regenerating ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {regenerating ? 'Regenerating…' : 'Regenerate roadmap'}
            </button>
          </motion.div>
        )}
      </div>

      {/* MAIN COMPOSITION — phase rail (tablist) + single-phase panel.
          ONLY the selected phase's tasks render to the right. Clicking
          another phase in the rail switches which phase's tasks are
          shown — no scrolling between phases, no all-phases-stacked
          wall of cards. The founder sees exactly the phase they're
          working in (default = their current phase, the first
          incomplete one) and can browse other phases on demand
          without losing focus.

          On md and below, the rail becomes a horizontal scroll-snap
          pill row above the panel (handled inside PhaseRail). The
          panel always stretches to the full remaining canvas width
          so task descriptions get comfortable reading width. */}
      <div className="px-4 sm:px-6 lg:px-10 pt-6 pb-10">
        {/* CRITICAL: minmax(0, 1fr) — without the explicit min=0, the
            CSS grid track defaults to min-width: auto, which means
            "do not shrink below intrinsic content width." A long
            task title or description with no soft breakpoints would
            then push the track wider than the canvas, the rail
            stays at 200px, and at the wrong viewport width the
            panel content collapses to a 1-character vertical
            column. minmax(0, 1fr) explicitly allows shrink. */}
        <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-8 lg:gap-10 items-start">
          <PhaseRail
            phases={data.phases}
            phaseRanges={phaseRanges}
            selectedPhase={effectiveSelectedPhase}
            activePhase={activePhase}
            onSelect={setSelectedPhase}
          />

          <section
            id="phase-panel"
            role="tabpanel"
            aria-labelledby={`phase-tab-${effectiveSelectedPhase}`}
            className="min-w-0"
            // Re-mount the panel on phase change so the entrance
            // motion replays — gives the click a felt response without
            // additional state machinery.
            key={`phase-panel-${effectiveSelectedPhase}`}
          >
            {visiblePhase && (
              <PhaseBlock
                phase={visiblePhase}
                index={visiblePhaseIndex >= 0 ? 0 : 0}
                roadmapId={data.id}
                founderGoal={founderGoal}
                progress={phaseProgress}
                weekRange={phaseRanges.find(r => r.phase === visiblePhase.phase)}
                isCurrentPhase={visiblePhase.phase === activePhase}
                onOutcomePromptDue={() => setManualOutcomeTrigger(true)}
              />
            )}
          </section>
        </div>
      </div>

      {/* BOTTOM SECTIONS — full-width affordances after the work.
          What's Next? + Parking Lot + Closing Thought + Outcome Form
          previously lived inside the constrained reading column; now
          they sit centered at max-w-4xl so they breathe. The founder
          reaches them naturally after scrolling through the tasks —
          which is the right cognitive moment for "take stock" or
          "park an idea." */}
      <div className="px-4 sm:px-6 lg:px-10 pb-12 flex flex-col gap-6">
        <div className="max-w-4xl mx-auto w-full">
          <WhatsNextPanel roadmapId={data.id} />
        </div>
        <div className="max-w-4xl mx-auto w-full">
          <ParkingLotInline roadmapId={data.id} initialItems={data.parkingLot ?? []} />
        </div>

        {data.closingThought && (() => {
          // Split the closing thought into a leading declarative
          // sentence (rendered as the bolder headline, design-tool
          // style) + the rest as supporting body. Boundary: first
          // sentence terminator (".", "!", "?") followed by whitespace.
          // Falls back to the entire string as headline when no
          // boundary exists, so a one-sentence closing thought still
          // renders cleanly.
          const text = data.closingThought.trim();
          const match = text.match(/^([^.!?]+[.!?])\s+(.+)$/s);
          const headline = match ? match[1].trim() : text;
          const body = match ? match[2].trim() : null;

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: data.phases.length * 0.06 + 0.2 }}
              className="max-w-4xl mx-auto w-full rounded-xl border border-gold/25 bg-gold/[0.04] px-5 py-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 size-9 rounded-lg border border-gold/30 bg-gold/10 text-gold flex items-center justify-center">
                  <Flag className="size-4" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                    Your next move
                  </p>
                  <p className="text-base font-semibold text-foreground leading-snug">
                    {headline}
                  </p>
                  {body && (
                    <p className="text-[13px] text-muted-foreground leading-[1.55]">
                      {body}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })()}

        {/* Concern 5 — outcome capture form. */}
        {outcomePromptVisible && (
          <div className="max-w-4xl mx-auto w-full">
            <OutcomeForm
              recommendationId={recommendationId}
              phaseTitles={data.phases.map(p => p.title)}
              surface={data.progress?.outcomePromptPending ? 'nudge' : 'completion'}
              onDone={() => setOutcomeDismissed(true)}
            />
          </div>
        )}
      </div>
    </div>
    </RoadmapWritabilityProvider>
  );
}
