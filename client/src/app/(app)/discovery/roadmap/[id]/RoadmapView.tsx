'use client';
// src/app/(app)/discovery/roadmap/[id]/RoadmapView.tsx
//
// Institute roadmap workspace. Composes the institute/roadmap
// primitives over the existing useRoadmapPolling data + the existing
// per-task transports (status/check-in via useTaskCheckIn inside
// TaskRow). Render layer only — no roadmap-generation or task-sizing
// logic changed.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { TopBar, Pill } from '@/components/institute';
import {
  PhaseRail,
  PhaseBlock,
  PaceMeter,
  ParkingLot,
  ContinuationEntry,
} from '@/components/institute/roadmap';
import { OutcomeForm } from '@/components/outcome/OutcomeForm';
import { NudgeBanner } from './NudgeBanner';
import { useRoadmapPolling } from './useRoadmapPolling';
import {
  RoadmapWritabilityProvider,
  type ReadOnlyReason,
} from './RoadmapWritabilityContext';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export interface RoadmapViewProps {
  recommendationId: string;
  /** The accepted recommendation's path — the H1 echoes it. */
  objective:        string | null;
  ventureName:      string | null;
  founderGoal:      string | null;
  writable:         boolean;
  readOnlyReason:   ReadOnlyReason | null;
}

export function RoadmapView({
  recommendationId,
  objective,
  ventureName,
  founderGoal,
  writable,
  readOnlyReason,
}: RoadmapViewProps) {
  const { data, loading, failed, regenerating, regenerate } = useRoadmapPolling(recommendationId);
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);
  const [manualOutcomeTrigger, setManualOutcomeTrigger] = useState(false);
  const [outcomeDismissed, setOutcomeDismissed] = useState(false);

  const phaseRanges = useMemo(
    () =>
      (data?.phases ?? []).reduce<Array<{ phase: number; startWeek: number; endWeek: number }>>((acc, p) => {
        const dur = Math.max(1, p.durationWeeks ?? 1);
        const start = acc.length === 0 ? 1 : acc[acc.length - 1].endWeek + 1;
        return [...acc, { phase: p.phase, startWeek: start, endWeek: start + dur - 1 }];
      }, []),
    [data?.phases],
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
        <Loader2 className="size-6 animate-spin text-accent" aria-hidden="true" />
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Building your execution roadmap…
        </p>
      </div>
    );
  }
  if (failed || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="text-[15px] text-fg-2">Something went wrong generating your roadmap.</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Try again from your recommendation page.
        </p>
      </div>
    );
  }

  const totalTasks = data.progress?.totalTasks ?? 0;
  const completedTasks = data.progress?.completedTasks ?? 0;
  const inFlight = data.phases.reduce(
    (n, p) => n + p.tasks.filter((t) => t.status === 'in_progress').length,
    0,
  );
  const completionPct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const toolsCalled = new Set(
    data.phases.flatMap((p) => p.tasks.flatMap((t) => t.suggestedTools ?? [])),
  ).size;

  // Active phase = first phase with an incomplete task; fall back to last.
  const activePhase =
    (data.phases.findIndex((p) => p.tasks.some((t) => t.status !== 'completed')) + 1) ||
    data.phases.length;
  const effectiveSelected =
    selectedPhase != null && data.phases.some((p) => p.phase === selectedPhase)
      ? selectedPhase
      : activePhase;

  const phaseProgress = data.progress
    ? { totalTasks: data.progress.totalTasks, completedTasks: data.progress.completedTasks }
    : null;

  const outcomeVisible =
    !outcomeDismissed && (manualOutcomeTrigger || !!data.progress?.outcomePromptPending);

  const onSelectPhase = (phase: number) => {
    setSelectedPhase(phase);
    if (typeof document !== 'undefined') {
      document.getElementById(`phase-${phase}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <RoadmapWritabilityProvider writable={writable} readOnlyReason={readOnlyReason}>
      <div className="flex h-full min-w-0 max-w-full flex-col overflow-x-hidden">
        <TopBar
          crumb={[
            { label: 'Ventures', accent: true, href: '/discovery/recommendations' },
            { label: ventureName ?? 'Venture' },
            { label: 'Roadmap · Cycle I', current: true },
          ]}
          rightStatus={
            <Pill accent>
              ● Active · {completedTasks}/{totalTasks} done
            </Pill>
          }
          rightActions={
            <Link
              href={`/discovery/recommendations/${recommendationId}`}
              className="text-muted transition-colors hover:text-fg"
            >
              ← Recommendation
            </Link>
          }
        />

        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {/* Header band */}
          <header className="min-w-0 border-b border-rule px-4 pb-7 pt-8 sm:px-12 sm:pb-9 sm:pt-12 lg:px-20">
            <div className="mb-5 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted sm:mb-6 sm:text-[11px] sm:tracking-[0.18em]">
              <span>Roadmap · Cycle <span className="text-accent">I</span></span>
              {data.weeklyHours && <span>Sized to {data.weeklyHours} h / week</span>}
              <span>Completion · <span className="text-accent">{completionPct}%</span></span>
            </div>
            <h1 className="max-w-[1000px] break-words font-sans text-fg [font-size:clamp(30px,9vw,64px)] [font-weight:500] [line-height:1.02] [letter-spacing:-0.025em] [overflow-wrap:anywhere]">
              {objective ?? 'Your execution roadmap.'}
            </h1>

            {/* Stats strip */}
            <div className="mt-7 grid max-w-[1000px] grid-cols-2 border border-rule sm:mt-8 sm:grid-cols-2 lg:grid-cols-5">
              <Stat k="Phases" v={String(data.phases.length)} sub="in order" />
              <Stat k="Tasks" v={String(totalTasks)} sub={`${completedTasks} done · ${inFlight} in flight`} />
              <Stat k="Time est." v={`${data.totalWeeks ?? '—'} w`} sub={data.weeklyHours ? `at ${data.weeklyHours} h / week` : ''} />
              <Stat k="Tools called" v={String(toolsCalled)} accent sub="suggested" />
              <Stat k="Completion" v={`${completionPct}%`} sub={completionPct >= 70 ? 'cycle nearly done' : 'in progress'} />
            </div>
          </header>

          {/* Read-only + STALE + nudge banners */}
          <div className="flex min-w-0 flex-col gap-4 px-4 pt-5 sm:px-12 sm:pt-6 lg:px-20">
            {!writable && readOnlyReason && (
              <div className="border-l-2 border-amber bg-amber/5 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
                This venture is {readOnlyReason} — read-only.
              </div>
            )}
            {data.status === 'STALE' && (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-amber/40 px-4 py-3">
                <p className="text-[13px] text-fg-2">
                  Your recommendation changed through pushback after this roadmap was built.
                  Regenerate to match the current recommendation.
                </p>
                <button
                  type="button"
                  onClick={() => { void regenerate(); }}
                  disabled={regenerating}
                  className="inline-flex items-center gap-2 border border-amber px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-amber disabled:opacity-50"
                >
                  {regenerating && <Loader2 className="size-3.5 animate-spin" />}
                  {regenerating ? 'Regenerating…' : 'Regenerate roadmap'}
                </button>
              </div>
            )}
            {data.progress?.nudgePending && (
              <NudgeBanner phases={data.phases} staleTaskTitle={data.progress?.staleTaskTitle ?? null} />
            )}
          </div>

          {/* Three-column layout */}
          <div className="grid min-w-0 grid-cols-1 gap-0 px-4 sm:px-12 lg:grid-cols-[200px_minmax(0,1fr)_320px] lg:px-0">
            <div className="min-w-0 py-6 sm:py-8 lg:border-r lg:border-rule lg:py-10 lg:pl-20 lg:pr-0">
              <PhaseRail
                phases={data.phases}
                selected={effectiveSelected}
                onSelect={onSelectPhase}
              />
            </div>

            <main className="min-w-0 py-6 sm:py-8 lg:px-14 lg:py-10">
              {data.phases.map((phase, i) => (
                <PhaseBlock
                  key={phase.phase}
                  phase={phase}
                  romanIndex={ROMAN[i] ?? String(phase.phase)}
                  roadmapId={data.id}
                  founderGoal={founderGoal}
                  progress={phaseProgress}
                  weekRange={phaseRanges.find((r) => r.phase === phase.phase)}
                  onOutcomePromptDue={() => setManualOutcomeTrigger(true)}
                />
              ))}

              {outcomeVisible && (
                <div className="mt-10">
                  <OutcomeForm
                    recommendationId={recommendationId}
                    phaseTitles={data.phases.map((p) => p.title)}
                    surface={data.progress?.outcomePromptPending ? 'nudge' : 'completion'}
                    onDone={() => setOutcomeDismissed(true)}
                  />
                </div>
              )}
            </main>

            <aside className="grid min-w-0 content-start gap-8 border-t border-rule py-8 lg:sticky lg:top-14 lg:h-[calc(100vh-56px)] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-7 lg:py-10 lg:pr-20">
              <RailBlock label="Pace">
                <PaceMeter
                  statedHours={data.weeklyHours}
                  derivedHours={null}
                  completionPct={completionPct}
                />
              </RailBlock>

              <RailBlock label={`Parking lot · ${data.parkingLot.length}`}>
                <ParkingLot items={data.parkingLot} />
              </RailBlock>

              <RailBlock label="When the cycle ends">
                <ContinuationEntry roadmapId={data.id} completionPct={completionPct} />
              </RailBlock>

              <RailBlock label="Nudges">
                <p className="font-mono text-[11px] leading-[1.6] tracking-[0.04em] text-muted">
                  Quiet for now. I&rsquo;ll check in if a task runs past its estimate, or if four
                  days pass with no activity.
                </p>
              </RailBlock>
            </aside>
          </div>
        </div>
      </div>
    </RoadmapWritabilityProvider>
  );
}

function Stat({ k, v, sub, accent }: { k: string; v: string; sub?: string; accent?: boolean }) {
  return (
    <div className="min-w-0 border-b border-r border-rule px-4 py-4 even:border-r-0 lg:border-b-0 lg:px-[22px] lg:py-[18px] lg:even:border-r lg:last:border-r-0">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{k}</div>
      <div className={`break-words font-serif text-[24px] italic leading-none tracking-[-0.01em] sm:text-[28px] ${accent ? 'text-accent' : 'text-fg'}`}>
        {v}
      </div>
      {sub && <div className="mt-1.5 font-mono text-[10px] tracking-[0.04em] text-muted-2">{sub}</div>}
    </div>
  );
}

function RailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{label}</div>
      {children}
    </div>
  );
}
