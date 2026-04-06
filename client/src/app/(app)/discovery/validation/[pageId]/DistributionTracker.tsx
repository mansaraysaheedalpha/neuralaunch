'use client';
// src/app/(app)/discovery/validation/[pageId]/DistributionTracker.tsx

import { useState } from 'react';
import type { DistributionBrief } from '@/lib/validation/schemas';

interface DistributionTrackerProps {
  pageId:            string;
  brief:             DistributionBrief;
  channelsCompleted: string[];
}

/**
 * DistributionTracker
 *
 * Shows the 3 recommended distribution channels with:
 *   - Channel name + audience reason + expected yield
 *   - The exact founder-voice message to send (copy button)
 *   - A checkbox to mark the channel as completed
 *
 * Completion state is persisted via POST /api/discovery/validation/[pageId]/channel.
 * A small header shows overall progress (e.g. "1 of 3 shared").
 */
export function DistributionTracker({
  pageId,
  brief,
  channelsCompleted: initialCompleted,
}: DistributionTrackerProps) {
  const [completed, setCompleted] = useState<Set<string>>(new Set(initialCompleted));
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [pending,   setPending]   = useState<string | null>(null);

  async function handleToggle(channel: string) {
    const next = !completed.has(channel);
    setPending(channel);

    // Optimistic update
    setCompleted(prev => {
      const copy = new Set(prev);
      if (next) copy.add(channel);
      else      copy.delete(channel);
      return copy;
    });

    try {
      const res = await fetch(`/api/discovery/validation/${pageId}/channel`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ channel, completed: next }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json() as { channelsCompleted: string[] };
      setCompleted(new Set(json.channelsCompleted));
    } catch {
      // Rollback on failure
      setCompleted(prev => {
        const copy = new Set(prev);
        if (next) copy.delete(channel);
        else      copy.add(channel);
        return copy;
      });
    } finally {
      setPending(null);
    }
  }

  async function handleCopy(idx: number, message: string) {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch { /* silent — user can copy manually */ }
  }

  const doneCount = brief.filter(c => completed.has(c.channel)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Where to share it</h3>
        <span className="text-xs text-muted-foreground">{doneCount} of {brief.length} shared</span>
      </div>

      <div className="flex flex-col gap-3">
        {brief.map((ch, i) => {
          const isDone   = completed.has(ch.channel);
          const isPend   = pending === ch.channel;
          return (
            <div
              key={`${ch.channel}-${i}`}
              className={[
                'rounded-xl border p-4 flex flex-col gap-3 transition-colors',
                isDone
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-card',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{ch.channel}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{ch.audienceReason}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { void handleToggle(ch.channel); }}
                  disabled={isPend}
                  aria-label={isDone ? 'Mark as not shared' : 'Mark as shared'}
                  className={[
                    'shrink-0 size-6 rounded-md border flex items-center justify-center transition-colors',
                    isDone
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/50',
                    isPend ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  {isDone && <span className="text-xs leading-none">✓</span>}
                </button>
              </div>

              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Expected yield</p>
              <p className="-mt-2 text-xs text-foreground/80">{ch.expectedYield}</p>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground/70">Message to send</p>
                <p className="whitespace-pre-wrap text-xs text-foreground/90 leading-relaxed">{ch.message}</p>
                <button
                  type="button"
                  onClick={() => { void handleCopy(i, ch.message); }}
                  className="mt-3 text-xs font-medium text-primary hover:underline"
                >
                  {copiedIdx === i ? '✓ Copied' : 'Copy message'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
