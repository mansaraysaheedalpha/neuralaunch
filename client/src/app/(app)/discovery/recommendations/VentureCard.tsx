'use client';
// src/app/(app)/discovery/recommendations/VentureCard.tsx
//
// Renders a single venture with nested cycles. Expandable — collapsed
// by default shows venture name, status badge, current cycle indicator,
// and roadmap progress bar. Expanded shows all prior cycles with links
// and the lifecycle action buttons (pause / resume / complete) that
// matter when the user has hit the venture cap and needs to free a
// slot without finishing the whole cycle flow.

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { Check, ChevronDown, FileText, Lock, Loader2, Map, Pause, Pencil, Play, Trash2, X } from 'lucide-react';
import type { Tier } from '@/lib/paddle/tiers';

const STATUS_CLASSES: Record<string, string> = {
  active:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  paused:    'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  completed: 'bg-muted text-muted-foreground',
};

interface CycleSummary {
  id:                  string;
  cycleNumber:         number;
  status:              string;
  selectedForkSummary: string | null;
  roadmapId:           string | null;
  /** Null on legacy pre-wiring rows; the UI hides the link when null. */
  recommendationId:    string | null;
  createdAt:           string;
  completedAt:         string | null;
}

export interface VentureCardProps {
  venture: {
    id:             string;
    name:           string;
    status:         string;
    currentCycleId: string | null;
    cycles:         CycleSummary[];
  };
  /** Progress for the active cycle's roadmap, if available. */
  progress: { completedTasks: number; totalTasks: number } | null;
  /** Founder's current tier — drives the upgrade CTA copy in pause/complete dialogs. */
  tier: Tier;
  /** Current count of the founder's paused ventures across the account. */
  pausedCount: number;
  /** Tier cap on paused ventures (Execute=2, Compound=4). */
  pausedCap: number;
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'deleting' }
  | { kind: 'confirming-pause' }
  | { kind: 'confirming-complete' }
  | { kind: 'confirming-delete' }
  | { kind: 'error'; message: string };

export function VentureCard({ venture, progress, tier, pausedCount, pausedCap }: VentureCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState(venture.name);
  const [name, setName]         = useState(venture.name);
  const [saving, setSaving]     = useState(false);
  const [status, setStatus]     = useState(venture.status);
  const [action, setAction]     = useState<ActionState>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) { setEditing(false); return; }
    setSaving(true);
    const prev = name;
    setName(trimmed); // optimistic
    setEditing(false);
    try {
      const res = await fetch(`/api/discovery/ventures/${venture.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) { setName(prev); } // revert
    } catch { setName(prev); } // revert
    finally { setSaving(false); }
  }

  function handleCancel() {
    setDraft(name);
    setEditing(false);
  }

  /**
   * Send a venture-status transition to the server. Optimistically
   * updates local state, reverts on non-ok response, and surfaces the
   * server error message (most importantly the cap-hit 403 when
   * resuming a paused venture would exceed the tier limit).
   */
  async function mutateStatus(next: 'active' | 'paused' | 'completed') {
    const prev = status;
    setAction({ kind: 'saving' });
    setStatus(next); // optimistic
    try {
      const res = await fetch(`/api/discovery/ventures/${venture.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setStatus(prev);
        const json = await res.json().catch(() => ({})) as { error?: string };
        setAction({
          kind:    'error',
          message: json.error ?? 'Could not update the venture. Please try again.',
        });
        return;
      }
      setAction({ kind: 'idle' });
      // Refresh the server component so the active/paused/completed
      // sections on /discovery/recommendations re-sort immediately.
      router.refresh();
    } catch {
      setStatus(prev);
      setAction({ kind: 'error', message: 'Network error — please try again.' });
    }
  }

  /**
   * Hard-delete the venture and everything cascading from it. The
   * server route fans out: delete the cycles' Recommendations
   * (cascades Roadmap + RoadmapProgress + ValidationPage), then
   * delete the Venture (cascades Cycle). Local state has nothing
   * to optimistically toggle to — on success we refresh the
   * server component so the venture disappears from its section.
   */
  async function mutateDelete() {
    setAction({ kind: 'deleting' });
    try {
      const res = await fetch(`/api/discovery/ventures/${venture.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setAction({
          kind:    'error',
          message: json.error ?? 'Could not delete the venture. Please try again.',
        });
        return;
      }
      router.refresh();
    } catch {
      setAction({ kind: 'error', message: 'Network error — please try again.' });
    }
  }

  const activeCycle = venture.cycles.find(c => c.status === 'in_progress');
  const completedCycles = venture.cycles.filter(c => c.status === 'completed');
  const totalCycles = venture.cycles.length;
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  const pct = progress && progress.totalTasks > 0
    ? Math.round((progress.completedTasks / progress.totalTasks) * 100)
    : null;

  const canPause    = status === 'active';
  const canResume   = status === 'paused';
  const canComplete = status === 'active' || status === 'paused';
  const isSaving    = action.kind === 'saving';
  const isDeleting  = action.kind === 'deleting';
  const busy        = isSaving || isDeleting;

  // Pause-cap state — surfaced inline on the confirm dialog so the
  // founder knows what the slot situation is *before* clicking
  // confirm (the API also enforces, but pre-flight UX prevents an
  // avoidable 403). Compute once per render from props.
  const pausedAtCap   = pausedCount >= pausedCap;
  const pausedSlotNum = pausedCount + 1;

  // Data-grounded motivational copy — if we can read task progress,
  // turn the pause-confirm warning into a quote of the founder's
  // own situation rather than a generic "be persistent" platitude.
  const progressPct = progress && progress.totalTasks > 0
    ? Math.round((progress.completedTasks / progress.totalTasks) * 100)
    : null;
  const pauseGroundedCopy: string = (() => {
    if (progressPct === null || !progress) {
      return 'Pausing means stepping away. Most founders who pause early never resume — be honest about whether this is a real break or a flinch from difficulty.';
    }
    if (progress.completedTasks === 0) {
      return 'You haven\'t completed any tasks yet. Pausing now is closer to abandoning than stepping away — most founders who pause before any progress never come back. If something concrete is in the way, getting unstuck is usually faster than restarting.';
    }
    if (progressPct < 30) {
      return `You've completed ${progress.completedTasks} of ${progress.totalTasks} tasks (${progressPct}%). Pausing this early means coming back to a half-built thing later — and most founders don't. Make sure pausing beats finishing one more task right now.`;
    }
    if (progressPct < 70) {
      return `You're ${progressPct}% through (${progress.completedTasks} of ${progress.totalTasks} tasks). You've built real momentum — pausing now hands it back. If something specific is blocking you, a check-in usually beats a pause.`;
    }
    return `You're ${progressPct}% through (${progress.completedTasks} of ${progress.totalTasks} tasks). You're closer to done than to start. Make sure pausing beats finishing.`;
  })();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => { if (!editing) setExpanded(o => !o); }}
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            {editing ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') handleCancel(); }}
                  maxLength={100}
                  disabled={saving}
                  className="text-sm font-semibold text-foreground bg-background border border-border rounded-md px-2 py-0.5 w-full max-w-[280px] outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-60"
                />
                <button type="button" onClick={() => { void handleSave(); }} disabled={saving} className="rounded-md p-0.5 text-emerald-600 hover:bg-emerald-500/10">
                  <Check className="size-3.5" />
                </button>
                <button type="button" onClick={handleCancel} className="rounded-md p-0.5 text-muted-foreground hover:bg-muted">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="group flex items-center gap-1.5 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setDraft(name); setEditing(true); }}
                  className="shrink-0 rounded-md p-0.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-opacity"
                  aria-label="Rename venture"
                >
                  <Pencil className="size-3" />
                </button>
              </div>
            )}
            <span className={`shrink-0 text-[9px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5 ${STATUS_CLASSES[status] ?? STATUS_CLASSES.completed}`}>
              {statusLabel}
            </span>
          </div>

          {activeCycle && (
            <p className="text-[11px] text-muted-foreground">
              Cycle {activeCycle.cycleNumber} of {totalCycles}
              {activeCycle.selectedForkSummary ? ` — "${activeCycle.selectedForkSummary}"` : ''}
            </p>
          )}

          {pct !== null && progress && (
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {pct}% — {progress.completedTasks} of {progress.totalTasks} tasks
              </span>
            </div>
          )}
        </div>

        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }} className="mt-1">
          <ChevronDown className="size-4 text-muted-foreground" />
        </motion.span>
      </button>

      {/* Expanded cycle list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            {/* Read-only banner — surfaced inside the expanded card
                whenever the venture is paused or completed. Tools and
                check-ins are blocked at the API layer; this label tells
                the founder why their tool actions aren't working when
                they navigate into the roadmap. The View buttons in the
                cycle list still work — read access stays open. */}
            {(status === 'paused' || status === 'completed') && (
              <div className="border-t border-border px-4 py-3 flex items-start gap-2 bg-muted/40">
                <Lock className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <p className="text-[11px] font-medium text-foreground">
                    {status === 'paused' ? 'Read-only — venture is paused' : 'Read-only — venture is complete'}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {status === 'paused'
                      ? 'You can read the roadmap, recommendation, and prior cycles. Check-ins, tools, and new task work are disabled until you resume.'
                      : 'The roadmap, recommendation, and prior cycles stay readable. No new check-ins, tool runs, or status changes will land — completed is terminal.'}
                  </p>
                </div>
              </div>
            )}

            <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
              {venture.cycles.map(cycle => {
                const isActive = cycle.status === 'in_progress';
                const dateStr = cycle.completedAt
                  ? new Date(cycle.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'in progress';

                return (
                  <div
                    key={cycle.id}
                    className={`rounded-md px-2.5 py-2 text-[11px] flex flex-col gap-1.5 ${isActive ? 'bg-primary/5' : 'bg-muted/20'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`size-1.5 rounded-full shrink-0 ${isActive ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                      <span className={`truncate ${isActive ? 'text-primary font-medium' : 'text-foreground/80'}`}>
                        Cycle {cycle.cycleNumber}{cycle.selectedForkSummary ? `: ${cycle.selectedForkSummary}` : ''}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{dateStr}</span>
                    </div>
                    {(cycle.recommendationId || cycle.roadmapId) && (
                      <div className="flex items-center flex-wrap gap-1.5 pl-3.5">
                        {cycle.recommendationId && (
                          <Link
                            href={`/discovery/recommendations/${cycle.recommendationId}`}
                            className="inline-flex items-center gap-1 rounded-md bg-background border border-border px-2 py-1 text-[10px] font-medium text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-colors"
                          >
                            <FileText className="size-2.5" />
                            View recommendation
                          </Link>
                        )}
                        {cycle.roadmapId && cycle.recommendationId && (
                          <Link
                            href={`/discovery/roadmap/${cycle.recommendationId}`}
                            className="inline-flex items-center gap-1 rounded-md bg-background border border-border px-2 py-1 text-[10px] font-medium text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-colors"
                          >
                            <Map className="size-2.5" />
                            View roadmap
                          </Link>
                        )}
                      </div>
                    )}
                    {!cycle.recommendationId && !cycle.roadmapId && (
                      <p className="pl-3.5 text-[10px] text-muted-foreground italic">No linked recommendation or roadmap yet.</p>
                    )}
                  </div>
                );
              })}
              {completedCycles.length === 0 && venture.cycles.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">No cycles yet.</p>
              )}
            </div>

            {/* Lifecycle actions — pause / resume / complete (hidden on
                terminal ventures) plus a Delete button that is always
                available so the user can hard-clean test data and
                obsolete ventures regardless of status. */}
            <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
              {action.kind === 'confirming-pause' && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold text-foreground">
                    Pause this venture?
                  </p>
                  <p className="text-[11px] text-foreground/80 leading-relaxed">
                    {pauseGroundedCopy}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    While paused: tools, check-ins, and roadmap nudges are
                    disabled. The roadmap and recommendation stay readable.
                    {pausedAtCap
                      ? ' '
                      : ` This will be paused slot ${pausedSlotNum} of ${pausedCap}.`}
                  </p>

                  {pausedAtCap ? (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex flex-col gap-2">
                      <p className="text-[11px] font-medium text-foreground">
                        You&apos;re at the {pausedCap}-paused-venture limit on {tier === 'execute' ? 'Execute' : 'Compound'}.
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {tier === 'execute'
                          ? 'Compound raises the cap to 4 paused ventures and lets you run 3 in parallel. Or complete or delete one of your paused ventures before pausing this one.'
                          : 'Complete or delete one of your paused ventures before pausing this one.'}
                      </p>
                      <div className="flex items-center gap-2">
                        {tier === 'execute' && (
                          <Link
                            href="/#pricing"
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/30 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                          >
                            Upgrade to Compound
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => setAction({ kind: 'idle' })}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { void mutateStatus('paused'); }}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-foreground hover:border-slate-500 hover:bg-muted transition-colors disabled:opacity-60"
                      >
                        {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Pause className="size-3" />}
                        Confirm pause
                      </button>
                      <button
                        type="button"
                        onClick={() => setAction({ kind: 'idle' })}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        Keep working
                      </button>
                    </div>
                  )}
                </div>
              )}

              {action.kind === 'confirming-complete' && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold text-foreground">
                    Mark this venture as completed?
                  </p>
                  <p className="text-[11px] text-foreground/80 leading-relaxed">
                    Completed is terminal. The roadmap, recommendation, and
                    cycle history stay readable forever — but no new
                    check-ins, tool runs, or status changes will ever land
                    on this venture again. Use this when you&apos;re truly
                    done with this direction (shipped, walked away, or
                    pivoted to a new venture).
                  </p>
                  <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                    This cannot be reversed. If you&apos;re just stepping
                    away for a while, pause instead.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void mutateStatus('completed'); }}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/40 px-3 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
                    >
                      {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      Confirm complete
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction({ kind: 'idle' })}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {action.kind === 'confirming-delete' && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-foreground leading-relaxed">
                    Permanently delete <span className="font-semibold">{name}</span>?
                    This removes every cycle, recommendation, and roadmap
                    inside it. <span className="font-semibold text-red-600 dark:text-red-400">This cannot be undone.</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void mutateDelete(); }}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-500/10 border border-red-500/40 px-3 py-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-60"
                    >
                      {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction({ kind: 'idle' })}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {action.kind !== 'confirming-pause' && action.kind !== 'confirming-complete' && action.kind !== 'confirming-delete' && (
                <div className="flex items-center flex-wrap gap-2">
                  {canPause && (
                    <button
                      type="button"
                      onClick={() => setAction({ kind: 'confirming-pause' })}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-foreground hover:border-slate-500 hover:bg-muted transition-colors disabled:opacity-60"
                      title="Pause to free an active-venture slot. The roadmap becomes read-only until you resume."
                    >
                      <Pause className="size-3" />
                      Pause venture
                    </button>
                  )}
                  {canResume && (
                    <button
                      type="button"
                      onClick={() => { void mutateStatus('active'); }}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 border border-primary/30 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
                      title="Resume — consumes an active-venture slot."
                    >
                      {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                      Resume venture
                    </button>
                  )}
                  {canComplete && (
                    <button
                      type="button"
                      onClick={() => setAction({ kind: 'confirming-complete' })}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Mark this venture as done. Terminal — cannot be reopened."
                    >
                      <Check className="size-3" />
                      Mark complete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAction({ kind: 'confirming-delete' })}
                    disabled={busy}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-transparent px-3 py-1.5 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-60"
                    title="Permanently delete this venture and its recommendations and roadmaps."
                  >
                    <Trash2 className="size-3" />
                    Delete venture
                  </button>
                </div>
              )}

              {action.kind === 'error' && (
                <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-400">
                  {action.message}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
