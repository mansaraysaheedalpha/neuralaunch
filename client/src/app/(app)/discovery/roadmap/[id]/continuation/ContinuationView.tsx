'use client';
// src/app/(app)/discovery/roadmap/[id]/continuation/ContinuationView.tsx
//
// Institute continuation brief. Polls the continuation endpoint, then
// renders the five-section memo + fork selection. Render layer only —
// the polling + fork-pick transports are unchanged.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  ContinuationBriefAny,
  ContinuationFork,
  ParkingLot,
} from '@/lib/continuation';
import { isLegacyBrief } from '@/lib/continuation';
import { TopBar, Pill, SynthesisOverlay } from '@/components/institute';
import {
  BriefCover,
  BriefSection,
  BriefProse,
  ForkCard,
  ClosingThought,
  ForkSelectionBar,
  OverturnedAssumptionList,
  EvidenceLedger,
  type BriefStat,
} from '@/components/institute/continuation';

/**
 * Cover-stats shape returned by the GET resolver. All figures sourced
 * from the same place the roadmap reads them so the brief reconciles
 * with the roadmap stats strip without recomputation.
 */
interface CoverStats {
  tasksComplete:       number;
  tasksTotal:          number;
  derivedHoursPerWeek: number | null;
  statedHoursPerWeek:  number | null;
  paceLabel:           'on_pace' | 'slower_pace' | 'unknown' | null;
  validationSignal:    'strong' | 'moderate' | 'weak' | 'negative' | 'absent' | null;
}

interface ContinuationData {
  continuationStatus: string | null;
  brief:              ContinuationBriefAny | null;
  parkingLot:         ParkingLot;
  coverStats?:        CoverStats;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_DEADLINE_MS = 4 * 60 * 1000;
const FORK_LETTERS = ['A', 'B', 'C', 'D'];

export interface ContinuationViewProps {
  roadmapId:        string;
  recommendationId: string;
  ventureName:      string | null;
}

export function ContinuationView({ roadmapId, recommendationId, ventureName }: ContinuationViewProps) {
  const router = useRouter();
  const [data, setData]       = useState<ContinuationData | null>(null);
  const [polling, setPolling] = useState(true);
  const [failed, setFailed]   = useState(false);
  const [selectedForkId, setSelectedForkId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [pickError, setPickError]   = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/continuation`);
      if (!res.ok) { setFailed(true); return; }
      setData(await res.json() as ContinuationData);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [roadmapId]);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + POLL_DEADLINE_MS;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() >= deadline) { setFailed(true); setPolling(false); return; }
      await refetch();
      if (cancelled) return;
      timer = setTimeout(() => { void tick(); }, POLL_INTERVAL_MS);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [polling, refetch]);

  useEffect(() => {
    if (!polling) return;
    const status = data?.continuationStatus;
    if (status === 'BRIEF_READY' || status === 'FORK_SELECTED' || data?.brief) {
      setPolling(false);
    }
  }, [data, polling]);

  const isPicked = data?.continuationStatus === 'FORK_SELECTED';

  const handleCommit = useCallback(async () => {
    const fork = data?.brief?.forks.find((f) => f.id === selectedForkId);
    if (!fork) return;
    setCommitting(true);
    setPickError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/continuation/fork`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ forkId: fork.id }),
      });
      const json = await res.json() as { newRecommendationId?: string; error?: string };
      if (!res.ok) { setPickError(json.error ?? 'Could not select that fork.'); return; }
      if (json.newRecommendationId) {
        router.push(`/discovery/roadmap/${json.newRecommendationId}`);
        return;
      }
      await refetch();
      router.refresh();
    } catch {
      setPickError('Network error — please try again.');
    } finally {
      setCommitting(false);
    }
  }, [data?.brief, selectedForkId, roadmapId, refetch, router]);

  const crumb = [
    { label: ventureName ?? 'Venture', accent: true },
    { label: 'Cycle I' },
    { label: 'Continuation Brief', current: true },
  ];

  // Loading — synthesis overlay with continuation-specific stages.
  if (polling && !data?.brief) {
    return (
      <div className="flex h-full flex-col">
        <TopBar crumb={crumb} rightStatus={<Pill>● Generating</Pill>} />
        <div className="relative flex-1">
          <SynthesisOverlay
            open
            stamp="Continuation"
            heading={<>Reading the cycle <em>back to you.</em></>}
            body="Five sections — what happened, what I got wrong, what the evidence says, the forks ahead. Ready in about a minute."
            steps={[
              { label: 'Reading the cycle · task history + check-ins', state: 'done' },
              { label: 'Comparing against the recommendation', state: 'done' },
              { label: 'Phase 1 · Opus reasoning across five sections', state: 'active' },
              { label: 'Brief · ready', state: 'pending' },
            ]}
          />
        </div>
      </div>
    );
  }

  if (failed || !data?.brief) {
    return (
      <div className="flex h-full flex-col">
        <TopBar crumb={crumb} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
          <p className="text-[15px] text-fg-2">Could not load your continuation brief.</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Return to the roadmap and try again.
          </p>
        </div>
      </div>
    );
  }

  const brief = data.brief;
  const parking = brief.parkingLotItems;
  const legacy = isLegacyBrief(brief);
  const coverStats = data.coverStats
    ? buildBriefStats(data.coverStats)
    : undefined;
  // removedForks is V2-only; legacy briefs never have it.
  const removedForks = !legacy ? brief.removedForks ?? [] : [];

  return (
    <div className="flex h-full flex-col">
      <TopBar
        crumb={crumb}
        rightStatus={<Pill accent>● Brief ready · Opus 4.6</Pill>}
        rightActions={
          <Link
            href={`/discovery/roadmap/${recommendationId}`}
            className="text-muted transition-colors hover:text-fg"
          >
            ← Roadmap
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <BriefCover
          cycleRoman="I"
          progressStamp="Cycle complete"
          heading={<>What you <em>learned.</em></>}
          stats={coverStats}
        />

        <div className="max-w-[1280px] px-6 pb-28 pt-16 sm:px-12 lg:px-20">
          <BriefSection num="I" stamp="What happened" heading={<>What the cycle <em>showed.</em></>} first>
            <BriefProse text={brief.whatHappened} />
          </BriefSection>

          <BriefSection num="II" stamp="What I got wrong" heading={<>Where the recommendation <em>missed.</em></>}>
            {legacy ? (
              <BriefProse text={brief.whatIGotWrong} />
            ) : brief.whatIGotWrong.length > 0 ? (
              <OverturnedAssumptionList items={brief.whatIGotWrong} />
            ) : (
              <BriefProse text="Every assumption held — the cycle's evidence didn't overturn any of the recommendation's original commitments." />
            )}
          </BriefSection>

          <BriefSection num="III" stamp="What the evidence says" heading={<>The signals across the <em>cycle.</em></>}>
            {legacy ? (
              <BriefProse text={brief.whatTheEvidenceSays} />
            ) : (
              <EvidenceLedger rows={brief.whatTheEvidenceSays} />
            )}
          </BriefSection>

          <BriefSection num="IV" stamp="The forks ahead" heading={<>Three honest <em>directions</em> from here.</>}>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
              {brief.forks.map((fork: ContinuationFork, i) => (
                <ForkCard
                  key={fork.id}
                  fork={fork}
                  letter={FORK_LETTERS[i] ?? String(i + 1)}
                  selected={!isPicked && selectedForkId === fork.id}
                  onSelect={() => !isPicked && setSelectedForkId(fork.id)}
                />
              ))}
            </div>
            {removedForks.length > 0 && (
              <p className="mt-6 max-w-[780px] font-mono text-[11px] leading-[1.5] tracking-[0.04em] text-muted">
                Note · {removedForks.map((rf) => (
                  <span key={rf.title}>
                    the <span className="text-fg">{rf.title.toLowerCase()}</span> fork has been
                    removed. {rf.reason} It can return if a future cycle surfaces a different signal.
                  </span>
                ))}
              </p>
            )}
            {pickError && (
              <p className="mt-4 border-l-2 border-amber bg-bg-2 px-4 py-3 font-serif text-[14px] italic text-fg-2">
                {pickError}
              </p>
            )}
          </BriefSection>

          {parking.length > 0 && (
            <BriefSection num="V" stamp="The parking lot" heading={<>Ideas you raised <em>along the way.</em></>}>
              <div className="grid gap-2 border-l-2 border-accent pl-6">
                {parking.map((item, i) => (
                  <div key={i} className="border-b border-dashed border-rule py-2.5 last:border-b-0">
                    <q className="font-serif text-[18px] italic leading-[1.4] text-fg">{item.idea}</q>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                      {formatWhen(item.surfacedAt)} · {item.taskContext ?? item.surfacedFrom}
                    </span>
                  </div>
                ))}
              </div>
            </BriefSection>
          )}

          <ClosingThought
            quote={brief.closingThought}
            cite="— NeuraLaunch · Continuation engine · Cycle I"
          />
        </div>
      </div>

      <ForkSelectionBar
        nextCycleRoman="II"
        selectedLetter={
          isPicked
            ? FORK_LETTERS[brief.forks.findIndex((f) => f.id === selectedForkId)] ?? null
            : selectedForkId
              ? FORK_LETTERS[brief.forks.findIndex((f) => f.id === selectedForkId)] ?? null
              : null
        }
        committing={committing}
        committed={!!isPicked}
        onReopen={() => router.push(`/discovery/roadmap/${recommendationId}`)}
        onCommit={() => { void handleCommit(); }}
      />
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'parked';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Convert the GET resolver's raw coverStats into the BriefCover stats
 * grid. Cells reconcile with the roadmap's stats strip because they
 * read from the same source (Roadmap.progress + Roadmap.executionMetrics
 * + loadValidationSignal). The "Key outcome metric" cell is omitted
 * — there is no canonical per-venture outcome metric on the row yet,
 * and a fabricated value would defeat the reconcile guarantee.
 */
function buildBriefStats(stats: CoverStats): BriefStat[] {
  const cells: BriefStat[] = [
    {
      k:   'Tasks complete',
      v:   `${stats.tasksComplete} / ${stats.tasksTotal}`,
      sub: stats.tasksTotal === 0 ? 'no tasks' : undefined,
    },
  ];
  if (stats.derivedHoursPerWeek != null) {
    const stated = stats.statedHoursPerWeek;
    const delta =
      stated != null && stated > 0
        ? Math.round(((stats.derivedHoursPerWeek - stated) / stated) * 100)
        : null;
    cells.push({
      k:      'Pace · derived hours',
      v:      `${stats.derivedHoursPerWeek} h / wk`,
      sub:    delta == null
                ? undefined
                : `${delta >= 0 ? '+' : ''}${delta}% vs stated ${stated} h`,
      accent: true,
    });
  } else {
    cells.push({
      k:   'Pace · derived hours',
      v:   '—',
      sub: 'not enough data yet',
    });
  }
  if (stats.validationSignal && stats.validationSignal !== 'absent') {
    const label =
      stats.validationSignal === 'strong'   ? 'Strong'
    : stats.validationSignal === 'moderate' ? 'Moderate'
    : stats.validationSignal === 'weak'     ? 'Weak'
    : /* negative */                          'Negative';
    const accent = stats.validationSignal === 'strong' || stats.validationSignal === 'negative';
    cells.push({
      k:      'Validation signal',
      v:      label,
      sub:    stats.validationSignal === 'negative' ? 'disconfirmed by data' : 'from landing page',
      accent,
    });
  }
  return cells;
}
