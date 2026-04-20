'use client';
// src/app/(app)/discovery/recommendation/VersionHistoryPanel.tsx
//
// Shows every prior version of a recommendation that was produced by
// a pushback refine/replace. Collapsed by default; each prior version
// expands to reveal the full pre-update recommendation body so the
// founder can compare what changed against the current live version.
//
// Server persists these as Recommendation.versions JSONB — one row
// per refine/replace, containing a full snapshot of the pre-update
// state. See pushback route.ts lines 274-284 for the write path.

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, RefreshCw, Replace, History } from 'lucide-react';

interface VersionSnapshot {
  round:     number;
  action:    'refine' | 'replace';
  timestamp: string;
  snapshot: {
    summary?:                string;
    path?:                   string;
    reasoning?:              string;
    firstThreeSteps?:        unknown;
    timeToFirstResult?:      string;
    risks?:                  unknown;
    assumptions?:            unknown;
    whatWouldMakeThisWrong?: string;
  };
}

interface VersionHistoryPanelProps {
  versions: VersionSnapshot[];
}

const ACTION_META = {
  refine:  { label: 'Refined',  icon: RefreshCw, cls: 'text-primary bg-primary/10 border-primary/30' },
  replace: { label: 'Replaced', icon: Replace,   cls: 'text-gold bg-gold/10 border-gold/30' },
} as const;

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month:  'short',
      day:    'numeric',
      hour:   'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Read-only rendering of a prior snapshot. Mirrors the key sections
 * of the live recommendation card but stripped of all controls
 * (accept, pushback, generate roadmap) — this is history, not a
 * target for action.
 */
function SnapshotBody({ snapshot }: { snapshot: VersionSnapshot['snapshot'] }) {
  const steps = safeArray(snapshot.firstThreeSteps);
  const risks = safeArray(snapshot.risks) as Array<{ risk?: string; mitigation?: string }>;
  const assumptions = safeArray(snapshot.assumptions);

  return (
    <div className="flex flex-col gap-4 text-xs leading-relaxed text-foreground/90">
      {snapshot.summary && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Summary</p>
          <p>{snapshot.summary}</p>
        </div>
      )}
      {snapshot.path && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Path</p>
          <p>{snapshot.path}</p>
        </div>
      )}
      {snapshot.timeToFirstResult && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Time to first result</p>
          <p>{snapshot.timeToFirstResult}</p>
        </div>
      )}
      {snapshot.reasoning && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Reasoning</p>
          <p className="whitespace-pre-wrap">{snapshot.reasoning}</p>
        </div>
      )}
      {steps.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">First three steps</p>
          <ol className="list-decimal list-inside flex flex-col gap-1">
            {steps.map((s, i) => (
              <li key={i}>{String(s)}</li>
            ))}
          </ol>
        </div>
      )}
      {risks.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Risks</p>
          <ul className="flex flex-col gap-2">
            {risks.map((r, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{r.risk ?? '—'}</span>
                {r.mitigation && (
                  <span className="block text-muted-foreground mt-0.5">Mitigation: {r.mitigation}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {assumptions.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Assumptions</p>
          <ul className="list-disc list-inside flex flex-col gap-1">
            {assumptions.map((a, i) => (
              <li key={i}>{String(a)}</li>
            ))}
          </ul>
        </div>
      )}
      {snapshot.whatWouldMakeThisWrong && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">What would make this wrong</p>
          <p className="whitespace-pre-wrap">{snapshot.whatWouldMakeThisWrong}</p>
        </div>
      )}
    </div>
  );
}

export function VersionHistoryPanel({ versions }: VersionHistoryPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  // Track which individual versions are expanded. Multiple can be open
  // at once so a founder can scroll between two side-by-side if they
  // open the browser wide enough.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (versions.length === 0) return null;

  // Newest-to-oldest so the most recent prior version is on top —
  // typically the one the founder wants to compare against the current.
  const ordered = [...versions].sort((a, b) => b.round - a.round);

  const toggle = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setPanelOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-semibold text-foreground">
            {versions.length === 1
              ? '1 prior version'
              : `${versions.length} prior versions`}
          </span>
          <span className="text-[11px] text-muted-foreground">
            — see how this recommendation evolved
          </span>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${panelOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.div
            key="panel-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-3 flex flex-col gap-3">
              {ordered.map((v, i) => {
                const meta = ACTION_META[v.action];
                const Icon = meta.icon;
                const isOpen = expanded.has(i);
                return (
                  <div key={`${v.round}-${i}`} className="rounded-lg border border-border bg-background">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.cls}`}>
                          <Icon className="size-2.5" aria-hidden="true" />
                          {meta.label}
                        </span>
                        <span className="text-[11px] font-medium text-foreground">
                          Version before round {v.round}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatWhen(v.timestamp)}
                        </span>
                      </div>
                      <ChevronDown
                        className={`size-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="snapshot-body"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-border px-4 py-3">
                            <SnapshotBody snapshot={v.snapshot} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground/80 leading-relaxed px-1">
                The live version above this panel is the latest. Each row
                here is a snapshot taken right before a refinement or
                replacement — expand one to see exactly what changed.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
