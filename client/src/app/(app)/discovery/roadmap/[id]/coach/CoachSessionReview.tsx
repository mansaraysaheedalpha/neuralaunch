'use client';
// src/app/(app)/discovery/roadmap/[id]/coach/CoachSessionReview.tsx
//
// Collapsed summary of a completed Coach session on the task card.
// Expandable to re-read the opening script and key asks. Shows
// rehearsal turn count and debrief status when present.

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, CheckCircle2, MessageSquare } from 'lucide-react';
import type { CoachSession } from '@/lib/roadmap/coach';

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp:  'WhatsApp',
  in_person: 'in-person',
  email:     'email',
  linkedin:  'LinkedIn',
};

export interface CoachSessionReviewProps {
  /** The coachSession from the task, typed broadly so the caller
   *  can pass the raw JSON field without a cast. */
  session: Record<string, unknown>;
}

/**
 * CoachSessionReview
 *
 * Renders the persistent summary of a completed Coach session on the
 * task card. Collapsed by default; expands to show opening script and
 * key asks. Rehearsal turn count and debrief status are surfaced inline.
 */
export function CoachSessionReview({ session }: CoachSessionReviewProps) {
  const [expanded, setExpanded] = useState(false);

  // Safe field reads — the caller passes Record<string, unknown>
  const typed = session as Partial<CoachSession>;
  const who      = typed.setup?.who ?? 'unknown';
  const channel  = typed.channel ?? 'in_person';
  const label    = CHANNEL_LABELS[channel as string] ?? channel;
  const opening  = typed.preparation?.openingScript;
  const keyAsks  = typed.preparation?.keyAsks ?? [];
  const history  = typed.rolePlayHistory ?? [];
  const debrief  = typed.debrief;

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[11px] font-semibold text-foreground truncate">
            Prepared for a conversation with {who} via {label}
          </p>
          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <MessageSquare className="size-3" />
                Rehearsed: {Math.ceil(history.length / 2)} turn{Math.ceil(history.length / 2) !== 1 ? 's' : ''}
              </span>
            )}
            {debrief && (
              <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                <CheckCircle2 className="size-3" />
                Debriefed
              </span>
            )}
          </div>
        </div>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        </motion.span>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 flex flex-col gap-3 border-t border-border">
              {opening && (
                <div className="pt-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Opening script
                  </p>
                  <p className="text-[11px] text-foreground whitespace-pre-wrap rounded-md bg-background border border-border px-2.5 py-2 leading-relaxed">
                    {opening}
                  </p>
                </div>
              )}

              {keyAsks.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Key asks
                  </p>
                  <ol className="flex flex-col gap-1.5">
                    {keyAsks.map((item, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span className="shrink-0 size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-[11px] text-foreground">{item.ask}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
