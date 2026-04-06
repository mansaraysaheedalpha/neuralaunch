'use client';
// src/app/(app)/discovery/roadmap/[id]/RoadmapView.tsx

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Clock, Target, Loader2 } from 'lucide-react';
import type { RoadmapPhase, RoadmapTask } from '@/lib/roadmap';

interface RoadmapData {
  id:             string;
  status:         'GENERATING' | 'READY' | 'FAILED' | 'STALE';
  phases:         RoadmapPhase[];
  closingThought: string | null;
  weeklyHours:    number | null;
  totalWeeks:     number | null;
}

type PollResponse = { status: 'not_started' } | RoadmapData;

function TaskCard({ task, index }: { task: RoadmapTask; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
    >
      <p className="text-sm font-medium text-foreground">{task.title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
      <div className="flex flex-wrap gap-3 mt-1">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" />{task.timeEstimate}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Target className="size-3" />{task.successCriteria}
        </span>
      </div>
      {task.rationale && (
        <p className="text-[11px] text-primary/70 italic border-t border-border pt-2 mt-1">
          {task.rationale}
        </p>
      )}
      {task.resources && task.resources.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {task.resources.map((r, i) => (
            <span key={i} className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
              {r}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function PhaseBlock({ phase, index }: { phase: RoadmapPhase; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 size-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
          {phase.phase}
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{phase.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{phase.objective}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            {phase.durationWeeks} week{phase.durationWeeks !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div className="ml-10 flex flex-col gap-2">
        {phase.tasks.map((task, i) => (
          <TaskCard key={i} task={task} index={i} />
        ))}
      </div>
    </motion.div>
  );
}

/**
 * RoadmapView
 *
 * Client Component — polls /api/discovery/recommendations/[id]/roadmap every 3s
 * while the roadmap is generating, then renders the full phased plan.
 */
export function RoadmapView({ recommendationId }: { recommendationId: string }) {
  const [data, setData]     = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed]  = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let pollTimeout:    ReturnType<typeof setTimeout>;
    const deadline =    Date.now() + 3 * 60 * 1000; // 3-minute hard stop
    let cancelled  =    false;

    async function poll() {
      if (cancelled) return;
      if (Date.now() >= deadline) { setFailed(true); setLoading(false); return; }

      try {
        const res = await fetch(`/api/discovery/recommendations/${recommendationId}/roadmap`);
        if (!res.ok) { setFailed(true); setLoading(false); return; }

        const json = await res.json() as PollResponse;

        if (json.status === 'not_started' || json.status === 'GENERATING') {
          pollTimeout = setTimeout(() => { void poll(); }, 3000);
        } else if (json.status === 'READY' || json.status === 'STALE') {
          // STALE roadmaps are still rendered — the founder can read
          // them — but the banner offers regeneration. The data is
          // structurally identical to READY.
          setData(json);
          setLoading(false);
        } else {
          // FAILED or unknown
          setFailed(true);
          setLoading(false);
        }
      } catch {
        setFailed(true);
        setLoading(false);
      }
    }

    void poll();
    return () => { cancelled = true; clearTimeout(pollTimeout); };
  }, [recommendationId]);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/discovery/recommendations/${recommendationId}/roadmap`, {
        method: 'POST',
      });
      if (!res.ok) {
        setRegenerating(false);
        return;
      }
      // Reset to loading state and re-poll. The POST upserts status
      // back to GENERATING, so the next poll cycle will pick that up.
      setData(null);
      setLoading(true);
      setRegenerating(false);
      // Force a fresh effect run by toggling the deps via a small
      // re-mount trick: update a counter. Simpler: just call poll
      // directly via a microtask. We use the existing useEffect by
      // bumping a dep — but since we don't have one here, just kick
      // off a one-shot fetch loop.
      const reloadDeadline = Date.now() + 3 * 60 * 1000;
      const reloadPoll = async () => {
        if (Date.now() >= reloadDeadline) { setFailed(true); setLoading(false); return; }
        try {
          const r = await fetch(`/api/discovery/recommendations/${recommendationId}/roadmap`);
          if (!r.ok) { setFailed(true); setLoading(false); return; }
          const j = await r.json() as PollResponse;
          if (j.status === 'not_started' || j.status === 'GENERATING') {
            setTimeout(() => { void reloadPoll(); }, 3000);
          } else if (j.status === 'READY' || j.status === 'STALE') {
            setData(j);
            setLoading(false);
          } else {
            setFailed(true);
            setLoading(false);
          }
        } catch {
          setFailed(true);
          setLoading(false);
        }
      };
      void reloadPoll();
    } finally {
      // setRegenerating(false) handled in branches above
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Building your execution roadmap…</p>
        <p className="text-xs text-muted-foreground/60">This takes about 20–30 seconds</p>
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

      {data.status === 'STALE' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex flex-col gap-3"
        >
          <div>
            <p className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">
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
            onClick={() => { void handleRegenerate(); }}
            disabled={regenerating}
            className="self-start flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {regenerating ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {regenerating ? 'Regenerating…' : 'Regenerate roadmap'}
          </button>
        </motion.div>
      )}

      <div className="flex flex-col gap-10">
        {data.phases.map((phase, i) => (
          <PhaseBlock key={phase.phase} phase={phase} index={i} />
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

    </div>
  );
}
