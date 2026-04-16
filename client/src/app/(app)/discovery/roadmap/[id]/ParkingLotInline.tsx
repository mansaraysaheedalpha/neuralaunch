'use client';
// src/app/(app)/discovery/roadmap/[id]/ParkingLotInline.tsx

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bookmark, Loader2, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import type { ParkingLotItem } from '@/lib/continuation';

const MAX_IDEA_LENGTH = 280;

export interface ParkingLotInlineProps {
  roadmapId:        string;
  initialItems:     ParkingLotItem[];
}

/**
 * ParkingLotInline
 *
 * Always-visible parking lot affordance on the roadmap page. Shows
 * the current count and an inline expandable form to manually add
 * an idea. The auto-capture vector lives inside the check-in agent
 * and writes to the same column — both vectors share the same
 * surface so the founder always sees the full set in one place.
 *
 * The continuation reveal page shows the FULL list as section 5 of
 * the brief. This component only renders a count + add affordance,
 * not a list, so the roadmap page stays clean.
 */
export function ParkingLotInline({ roadmapId, initialItems }: ParkingLotInlineProps) {
  const [items, setItems]       = useState(initialItems);
  const [open, setOpen]         = useState(false);
  const [draft, setDraft]       = useState('');
  const [submitting, setSubmit] = useState(false);
  const [error, setError]       = useState<string | null>(null);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-border bg-background px-4 py-3 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Bookmark className="size-3.5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">
            Parking lot
            <span className="ml-1.5 text-[11px] text-muted-foreground font-normal">
              ({items.length} idea{items.length === 1 ? '' : 's'})
            </span>
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[11px] text-primary hover:underline underline-offset-2"
          >
            Park an idea →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { setOpen(false); setDraft(''); setError(null); }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Anything you want to remember but not act on yet. I&apos;ll surface these in your continuation brief later.
      </p>

      {items.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex flex-col gap-0.5"
            >
              <p className="text-[11px] text-foreground leading-relaxed">{item.idea}</p>
              <p className="text-[10px] text-muted-foreground">
                {item.taskContext
                  ? `from "${item.taskContext}"`
                  : item.surfacedFrom
                    ? `surfaced via ${item.surfacedFrom}`
                    : null}
                {item.surfacedAt ? ` · ${new Date(item.surfacedAt).toLocaleDateString()}` : ''}
              </p>
            </li>
          ))}
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
              className="min-h-0 resize-none py-2 text-[11px]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {draft.length}/{MAX_IDEA_LENGTH}
              </span>
              <button
                type="button"
                onClick={() => { void handleAdd(); }}
                disabled={draft.trim().length === 0 || submitting}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {submitting && <Loader2 className="size-3 animate-spin" />}
                Save
              </button>
            </div>
            {error && <p className="text-[10px] text-red-500">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
