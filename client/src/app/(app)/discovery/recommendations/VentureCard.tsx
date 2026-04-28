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
import { Check, ChevronDown, FileText, Lock, Loader2, Map, Pause, Pencil, Play, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import type { Tier } from '@/lib/paddle/tiers';
import { isWithinReopenWindow } from '@/lib/transformation/constants';

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

/** Snapshot of the venture's transformation report state. Null on
 *  ventures that have never been completed; populated as soon as
 *  Mark Complete fires (with stage='queued' before the worker has
 *  written anything). The card uses it to drive the report-status
 *  pill and the 24h Reopen button. */
export interface TransformationReportSummary {
  stage:        string;
  publishState: string;
  createdAt:    string;
}

export interface VentureCardProps {
  venture: {
    id:             string;
    name:           string;
    status:         string;
    currentCycleId: string | null;
    cycles:         CycleSummary[];
    transformationReport: TransformationReportSummary | null;
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

  // Pause-reason sub-state machine — orthogonal to `action`. Drives
  // the three-step pause dialog: type-reason → wait-for-agent →
  // see-reply-and-confirm. Resets to 'reason' every time the founder
  // (re-)opens the pause dialog from idle.
  const [pauseStep, setPauseStep] = useState<'reason' | 'loading' | 'reply'>('reason');
  const [pauseReasonDraft, setPauseReasonDraft] = useState('');
  const [pauseAgentResult, setPauseAgentResult] = useState<{
    mode:    'acknowledge' | 'reframe' | 'mirror' | 'static';
    message: string | null;
  } | null>(null);

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
   *
   * The pause-reason agent surface threads its captured reason +
   * mode through the optional `pauseMeta` arg so the PATCH route
   * can persist them alongside the status flip in one transaction.
   */
  async function mutateStatus(
    next: 'active' | 'paused' | 'completed',
    pauseMeta?: { reason: string | null; mode: string },
  ) {
    const prev = status;
    setAction({ kind: 'saving' });
    setStatus(next); // optimistic
    try {
      const body: Record<string, unknown> = { status: next };
      if (pauseMeta) {
        body.pauseReasonMode = pauseMeta.mode;
        if (pauseMeta.reason !== null) body.pauseReason = pauseMeta.reason;
      }
      const res = await fetch(`/api/discovery/ventures/${venture.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
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
   * Fire the pause-reason agent against the founder's typed reason.
   * Always resolves — engine timeout / 5xx surfaces as mode='static'
   * so the dialog can render the existing pre-LLM motivational copy
   * fallback. The route enforces this contract.
   */
  async function runPauseAgent(reason: string) {
    setPauseStep('loading');
    try {
      const res = await fetch(`/api/discovery/ventures/${venture.id}/pause-reason`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason }),
      });
      if (!res.ok) {
        // Soft fall-through to the static copy. We deliberately do
        // NOT surface the agent's failure as an action error — the
        // pause path must always be available to the founder.
        setPauseAgentResult({ mode: 'static', message: null });
        setPauseStep('reply');
        return;
      }
      const json = await res.json() as {
        mode:    'acknowledge' | 'reframe' | 'mirror' | 'static';
        message: string | null;
      };
      setPauseAgentResult(json);
      setPauseStep('reply');
    } catch {
      setPauseAgentResult({ mode: 'static', message: null });
      setPauseStep('reply');
    }
  }

  /**
   * Reset the pause sub-state machine. Called by the existing Cancel
   * paths and by the cap-hit branch (which never opens the agent
   * dialog).
   */
  function resetPauseDialog() {
    setPauseStep('reason');
    setPauseReasonDraft('');
    setPauseAgentResult(null);
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

  // Reopen affordance — only on a completed venture, only inside
  // the 24h window, and only when the transformation report has
  // not been published. After 24h or once shared publicly, the
  // venture is permanently completed; the button is hidden.
  const report      = venture.transformationReport;
  const reopenable  =
       status === 'completed'
    && report != null
    && isWithinReopenWindow(report.createdAt)
    && report.publishState === 'private';
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

            {/* Transformation-report status — surfaced on completed
                ventures only. The Inngest worker writes through stages
                queued → loading_data → drafting → detecting_redactions
                → persisting → complete (or failed); each row
                describes what's happening and the link target.
                Published-public reports surface a separate share badge
                beneath. */}
            {status === 'completed' && report && (
              <div className="border-t border-border px-4 py-3 flex items-start gap-2 bg-primary/5">
                <Sparkles className="size-3.5 text-primary mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  {report.stage === 'complete' ? (
                    <>
                      <p className="text-[11px] font-medium text-foreground">
                        Your transformation report is ready
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        A personal narrative of how this venture went — written from your real check-ins and outcomes. Read it whenever you&apos;re ready.
                      </p>
                      <Link
                        href={`/discovery/recommendations/${venture.id}/transformation`}
                        className="self-start mt-1 text-[11px] font-medium text-primary hover:text-primary/80 underline underline-offset-2"
                      >
                        Open transformation report →
                      </Link>
                    </>
                  ) : report.stage === 'failed' ? (
                    <>
                      <p className="text-[11px] font-medium text-foreground">
                        Transformation report failed
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Something went wrong generating your narrative. The venture is still completed; you can re-trigger the report from the report viewer.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] font-medium text-foreground inline-flex items-center gap-1.5">
                        <Loader2 className="size-3 animate-spin" />
                        Generating your transformation report…
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        I&apos;m reading every cycle, every check-in, and every tool you used to write a personal narrative of how this went. Takes about 30 seconds. You can close this tab — it&apos;ll be ready when you come back.
                      </p>
                      <Link
                        href={`/discovery/recommendations/${venture.id}/transformation`}
                        className="self-start mt-1 text-[11px] font-medium text-primary hover:text-primary/80 underline underline-offset-2"
                      >
                        Watch progress →
                      </Link>
                    </>
                  )}
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

                  {/* Cap-hit branch supersedes the pause-reason agent
                      flow entirely — no point asking the founder to
                      reflect on a pause they can't actually take. */}
                  {pausedAtCap && (
                    <>
                      <p className="text-[11px] text-foreground/80 leading-relaxed">
                        {pauseGroundedCopy}
                      </p>
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
                            onClick={() => { setAction({ kind: 'idle' }); resetPauseDialog(); }}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Step 1 — type the reason. The founder can also
                      skip with "Continue without saying" which records
                      the pause as mode='no_reason' and goes straight
                      to the existing static motivational copy. */}
                  {!pausedAtCap && pauseStep === 'reason' && (
                    <>
                      <label className="text-[11px] text-foreground/80 leading-relaxed">
                        What&apos;s pulling you away? One or two sentences. I&apos;ll read this against your venture history and give you a quick reflection before you confirm.
                      </label>
                      <textarea
                        value={pauseReasonDraft}
                        onChange={e => setPauseReasonDraft(e.target.value.slice(0, 1000))}
                        placeholder="e.g. life event came up, motivation has dropped, market signal said no…"
                        rows={3}
                        maxLength={1000}
                        className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
                      />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        While paused: tools, check-ins, and roadmap nudges are disabled.
                        The roadmap and recommendation stay readable.
                        {` This will be paused slot ${pausedSlotNum} of ${pausedCap}.`}
                      </p>
                      <div className="flex items-center flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => { void runPauseAgent(pauseReasonDraft.trim()); }}
                          disabled={busy || pauseReasonDraft.trim().length === 0}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                        >
                          Submit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Skip the agent — record mode='no_reason'
                            // and pause immediately. Static fallback
                            // copy is implicit (no reflection shown).
                            void mutateStatus('paused', { reason: null, mode: 'no_reason' });
                          }}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                        >
                          Continue without saying
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAction({ kind: 'idle' }); resetPauseDialog(); }}
                          disabled={busy}
                          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          Keep working
                        </button>
                      </div>
                    </>
                  )}

                  {/* Step 2 — engine in flight. ~2-3s p50, hard 5s
                      cap on the server. Cancel button still available
                      so the founder isn't trapped if the network is
                      slow. */}
                  {!pausedAtCap && pauseStep === 'loading' && (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 flex items-center gap-2">
                      <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                      <p className="text-[11px] text-foreground/80 leading-relaxed">
                        Reading your reason against your venture history…
                      </p>
                    </div>
                  )}

                  {/* Step 3 — agent reply. Three actions: confirm
                      pause (fires PATCH with the captured reason +
                      mode), type a different reason (back to step 1),
                      or cancel. If the engine fell back to static
                      (mode='static', message=null) we render the
                      existing static motivational copy as the
                      reflection block. */}
                  {!pausedAtCap && pauseStep === 'reply' && pauseAgentResult && (
                    <>
                      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 flex flex-col gap-1.5">
                        <p className="text-[10px] uppercase tracking-widest text-primary/70 font-semibold">
                          Reflection
                        </p>
                        <p className="text-[11px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
                          {pauseAgentResult.message ?? pauseGroundedCopy}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        While paused: tools, check-ins, and roadmap nudges are disabled.
                        {` This will be paused slot ${pausedSlotNum} of ${pausedCap}.`}
                      </p>
                      <div className="flex items-center flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void mutateStatus('paused', {
                              reason: pauseReasonDraft.trim().length > 0 ? pauseReasonDraft.trim() : null,
                              mode:   pauseAgentResult.mode,
                            });
                          }}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-foreground hover:border-slate-500 hover:bg-muted transition-colors disabled:opacity-60"
                        >
                          {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Pause className="size-3" />}
                          Confirm pause
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Drop the previous reason + reply, back
                            // to step 1 with a clean draft. By design
                            // the previous reason is NOT carried into
                            // the new agent call (no chat history).
                            setPauseReasonDraft('');
                            setPauseAgentResult(null);
                            setPauseStep('reason');
                          }}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                        >
                          Type a different reason
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAction({ kind: 'idle' }); resetPauseDialog(); }}
                          disabled={busy}
                          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          Keep working
                        </button>
                      </div>
                    </>
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
                      onClick={() => {
                        // Reset the pause sub-state machine before
                        // opening so a previous pass's draft / agent
                        // reply doesn't leak into the new attempt.
                        resetPauseDialog();
                        setAction({ kind: 'confirming-pause' });
                      }}
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
                      title="Mark this venture as done. Terminal — cannot be reopened after 24h."
                    >
                      <Check className="size-3" />
                      Mark complete
                    </button>
                  )}
                  {reopenable && (
                    <button
                      type="button"
                      onClick={() => { void mutateStatus('active'); }}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-60"
                      title="Reopen within 24 hours of marking complete. Deletes the transformation report so re-completing generates fresh."
                    >
                      {isSaving ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                      Reopen venture
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
