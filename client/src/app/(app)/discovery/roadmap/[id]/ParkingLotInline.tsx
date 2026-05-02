'use client';
// src/app/(app)/discovery/roadmap/[id]/ParkingLotInline.tsx

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bookmark, Loader2, X, Plus } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import type { ParkingLotItem } from '@/lib/continuation';
import { useRoadmapWritability } from './RoadmapWritabilityContext';

const MAX_IDEA_LENGTH = 280;
const MAX_VISIBLE_ITEMS = 3;
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ParkingLotInlineProps {
  roadmapId:        string;
  initialItems:     ParkingLotItem[];
}

/**
 * Format a relative timestamp the way the design tool does:
 * "2d ago", "4h ago", "1w ago", "just now". Mono pairs well with
 * tabular nums; the unit is a single letter (s/m/h/d/w) so the
 * widths stay consistent across rows.
 */
function relativeAgo(iso: string | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const ms = Date.now() - then;
  if (ms < 60_000)        return 'just now';
  if (ms < 3_600_000)     return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)    return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 604_800_000)   return `${Math.floor(ms / 86_400_000)}d ago`;
  if (ms < 2_592_000_000) return `${Math.floor(ms / 604_800_000)}w ago`;
  return `${Math.floor(ms / 2_592_000_000)}mo ago`;
}

/**
 * ParkingLotInline
 *
 * Always-visible parking lot affordance on the roadmap page.
 *
 * Design tool spec:
 *   - Gold bookmark tile on the left (matches WhatsNext compass tile)
 *   - "N ideas parked" headline on top
 *   - "+M this week" chip beside the headline (recency cue, not a
 *     raw count) — only when M > 0
 *   - "Park an idea" CTA in the top-right
 *   - Dotted-divided list of up to MAX_VISIBLE_ITEMS most-recent
 *     ideas, each row: small bookmark icon + idea text + "Nd ago"
 *     mono on the right
 *   - Provenance metadata removed from the row (it lived as a small
 *     italic line beneath each item before — clutter for the
 *     roadmap surface; still accessible on the continuation reveal
 *     page where the full per-item context belongs)
 */
export function ParkingLotInline({ roadmapId, initialItems }: ParkingLotInlineProps) {
  const [items, setItems]       = useState(initialItems);
  const [open, setOpen]         = useState(false);
  const [draft, setDraft]       = useState('');
  const [submitting, setSubmit] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const { writable } = useRoadmapWritability();

  const handleAdd = async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || submitting) return;
    setSubmit(true);
    setError(null);
    try {
      const res = await fetch(`/api/discovery/roadmaps/${roadmapId}/parking-lot`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ idea: trimmed }),
      });
      const json = await res.json() as {
        parkingLot?: ParkingLotItem[];
        error?:      string;
      };
      if (!res.ok) {
        setError(json.error ?? 'Could not park the idea.');
        return;
      }
      if (json.parkingLot) setItems(json.parkingLot);
      setDraft('');
      setOpen(false);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmit(false);
    }
  };

  // Sort items most-recent first for display so the dotted list
  // surfaces what the founder just parked. Falls back to the array's
  // existing order when surfacedAt is missing.
  const sortedItems = [...items].sort((a, b) => {
    const ta = a.surfacedAt ? new Date(a.surfacedAt).getTime() : 0;
    const tb = b.surfacedAt ? new Date(b.surfacedAt).getTime() : 0;
    return tb - ta;
  });
  const visibleItems = sortedItems.slice(0, MAX_VISIBLE_ITEMS);
  const overflowCount = Math.max(0, sortedItems.length - MAX_VISIBLE_ITEMS);

  // "+M this week" chip — count items parked in the last 7 days.
  const recentCount = items.filter(it => {
    if (!it.surfacedAt) return false;
    const t = new Date(it.surfacedAt).getTime();
    return Number.isFinite(t) && Date.now() - t < RECENT_WINDOW_MS;
  }).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-border bg-card/40 px-5 py-5 flex flex-col gap-3"
    >
      {/* Header row — gold tile + headline + chip + CTA. Stacks on
          mobile so the "Park an idea" CTA doesn't crowd the headline
          at 375px. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 size-9 rounded-lg border border-gold/30 bg-gold/10 text-gold flex items-center justify-center">
            <Bookmark className="size-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
              Parking lot
            </p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-base font-semibold text-foreground leading-snug">
                {items.length === 0
                  ? 'Nothing parked yet'
                  : `${items.length} idea${items.length === 1 ? '' : 's'} parked`}
              </p>
              {recentCount > 0 && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  +{recentCount} this week
                </span>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground leading-[1.55] mt-1">
              Anything you want to remember but not act on yet. I&apos;ll surface these in your continuation brief later.
            </p>
          </div>
        </div>

        {writable && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-xs font-medium text-foreground/85 hover:bg-gold/10 hover:text-foreground transition-colors sm:mt-1 self-start ml-12 sm:ml-0"
          >
            <Plus className="size-3.5 text-gold" aria-hidden="true" />
            Park an idea
          </button>
        )}
        {writable && open && (
          <button
            type="button"
            onClick={() => { setOpen(false); setDraft(''); setError(null); }}
            className="shrink-0 text-muted-foreground hover:text-foreground mt-1"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Dotted-divided list of recent ideas. Provenance/date stamp is
          intentionally dropped from the row per the design tool — those
          live on the continuation reveal page where the full per-item
          context belongs. */}
      {visibleItems.length > 0 && (
        <ul role="list" className="flex flex-col divide-y divide-border/60 border-t border-border/60 pt-1">
          {visibleItems.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-3 py-2.5"
            >
              <Bookmark className="size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
              <p className="text-[13px] text-foreground/85 leading-snug flex-1 min-w-0 break-words">
                {item.idea}
              </p>
              {item.surfacedAt && (
                <p className="text-[10px] font-mono text-muted-foreground/70 shrink-0 tabular-nums">
                  {relativeAgo(item.surfacedAt)}
                </p>
              )}
            </li>
          ))}
          {overflowCount > 0 && (
            <li className="py-2.5 text-[11px] text-muted-foreground/70 italic">
              +{overflowCount} more — review them all in your continuation brief
            </li>
          )}
        </ul>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2 overflow-hidden"
          >
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value.slice(0, MAX_IDEA_LENGTH))}
              placeholder="A short phrase capturing the idea…"
              rows={2}
              maxLength={MAX_IDEA_LENGTH}
              disabled={submitting}
              className="min-h-0 resize-none py-2 text-[13px]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                {draft.length}/{MAX_IDEA_LENGTH}
              </span>
              <button
                type="button"
                onClick={() => { void handleAdd(); }}
                disabled={draft.trim().length === 0 || submitting}
                className="inline-flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <Loader2 className="size-3 animate-spin" />}
                Save
              </button>
            </div>
            {error && <p className="text-[11px] text-red-400">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
