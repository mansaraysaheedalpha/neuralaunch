'use client';
// src/app/(app)/discovery/roadmap/[id]/RoadmapView.tsx

import { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { OutcomeForm } from '@/components/outcome/OutcomeForm';
import { useRoadmapPolling } from './useRoadmapPolling';
import { PhaseBlock } from './PhaseBlock';
import { WhatsNextPanel } from './WhatsNextPanel';
import { ParkingLotInline } from './ParkingLotInline';
import { NudgeBanner } from './NudgeBanner';
import { RoadmapProgressHeader } from './RoadmapProgressHeader';

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
}: {
  recommendationId: string;
  founderGoal:      string | null;
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

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto px-6 py-10">

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Your Execution Roadmap</h1>
        {data.totalWeeks && data.weeklyHours && (
          <p className="text-sm text-muted-foreground">
            {data.totalWeeks} week{data.totalWeeks !== 1 ? 's' : ''} · {data.weeklyHours} hours/week
          </p>
        )}
      </motion.div>

      {data.progress && (
        <RoadmapProgressHeader
          totalTasks={data.progress.totalTasks}
          completedTasks={data.progress.completedTasks}
          blockedTasks={data.progress.blockedTasks ?? 0}
          totalPhases={data.phases.length}
          currentPhase={
            (data.phases.findIndex(p =>
              (p.tasks as Array<{ status?: string }>).some(t => t.status !== 'completed'),
            ) + 1) || data.phases.length
          }
          totalWeeks={data.totalWeeks ?? null}
        />
      )}

      {/* Proactive nudge banner — set by the daily Inngest sweep when
          an in-progress task has gone stale. The founder always sees
          this above any STALE banner because the urgency order is:
          (1) you have an open task that needs an update,
          (2) the recommendation changed underneath you. */}
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

      <div className="flex flex-col gap-10">
        {data.phases.map((phase, i) => (
          <PhaseBlock
            key={phase.phase}
            phase={phase}
            index={i}
            roadmapId={data.id}
            founderGoal={founderGoal}
            progress={phaseProgress}
            onOutcomePromptDue={() => setManualOutcomeTrigger(true)}
          />
        ))}
      </div>

      {data.closingThought && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: data.phases.length * 0.1 + 0.2 }}
          className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70 mb-2">Your Next Move</p>
          <p className="text-sm text-foreground leading-relaxed">{data.closingThought}</p>
        </motion.div>
      )}

      {/* Roadmap continuation — always visible. The "What's Next?"
          panel evaluates progress and either opens the diagnostic
          chat (Scenarios A/B) or fires the brief generation
          (Scenarios C/D). The parking lot affordance lives next to
          it so the founder can capture adjacent ideas at any moment.
          See docs/ROADMAP_CONTINUATION.md. */}
      <WhatsNextPanel roadmapId={data.id} />
      <ParkingLotInline roadmapId={data.id} initialItems={data.parkingLot ?? []} />

      {/* Concern 5 — outcome capture form. Surfaced at the bottom of
          the roadmap when either trigger #1 (final task complete via
          server signal) or trigger #2 (server flagged
          outcomePromptPending) fires. The form contains the inline
          consent card on first use. */}
      {outcomePromptVisible && (
        <OutcomeForm
          recommendationId={recommendationId}
          phaseTitles={data.phases.map(p => p.title)}
          surface={data.progress?.outcomePromptPending ? 'nudge' : 'completion'}
          onDone={() => setOutcomeDismissed(true)}
        />
      )}

    </div>
  );
}
