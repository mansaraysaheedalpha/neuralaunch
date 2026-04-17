'use client';
// src/app/(app)/discovery/recommendations/VentureCard.tsx
//
// Renders a single venture with nested cycles. Expandable — collapsed
// by default shows venture name, status badge, current cycle indicator,
// and roadmap progress bar. Expanded shows all prior cycles with links.
// Venture name is inline-editable via pencil icon → text input → check/x.

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { Check, ChevronDown, Pencil, X } from 'lucide-react';

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
}

export function VentureCard({ venture, progress }: VentureCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState(venture.name);
  const [name, setName]         = useState(venture.name);
  const [saving, setSaving]     = useState(false);
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

  const activeCycle = venture.cycles.find(c => c.status === 'in_progress');
  const completedCycles = venture.cycles.filter(c => c.status === 'completed');
  const totalCycles = venture.cycles.length;
  const statusLabel = venture.status.charAt(0).toUpperCase() + venture.status.slice(1);

  const pct = progress && progress.totalTasks > 0
    ? Math.round((progress.completedTasks / progress.totalTasks) * 100)
    : null;

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
            <span className={`shrink-0 text-[9px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5 ${STATUS_CLASSES[venture.status] ?? STATUS_CLASSES.completed}`}>
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
            <div className="border-t border-border px-4 py-3 flex flex-col gap-2">
              {venture.cycles.map(cycle => {
                const isActive = cycle.status === 'in_progress';
                const href = cycle.roadmapId ? `/discovery/roadmap/${cycle.roadmapId}` : null;
                const dateStr = cycle.completedAt
                  ? new Date(cycle.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'in progress';

                return href ? (
                  <Link key={cycle.id} href={href}
                    className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${isActive ? 'bg-primary/5 text-primary font-medium hover:bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
                  >
                    <span className={`size-1.5 rounded-full shrink-0 ${isActive ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                    <span className="truncate">Cycle {cycle.cycleNumber}{cycle.selectedForkSummary ? `: ${cycle.selectedForkSummary}` : ''}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{dateStr}</span>
                  </Link>
                ) : (
                  <div key={cycle.id} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    <span className="size-1.5 rounded-full shrink-0 bg-muted-foreground/40" />
                    <span className="truncate">Cycle {cycle.cycleNumber} — no roadmap yet</span>
                  </div>
                );
              })}
              {completedCycles.length === 0 && venture.cycles.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">No cycles yet.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
