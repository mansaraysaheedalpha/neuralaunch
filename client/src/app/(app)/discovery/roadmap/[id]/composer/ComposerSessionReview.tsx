'use client';
// src/app/(app)/discovery/roadmap/[id]/composer/ComposerSessionReview.tsx
//
// Collapsed summary of a completed Composer session on the task card.
// Shows mode, channel, messages generated, and sent count. Expandable
// to re-read the first message body.

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, SendHorizonal } from 'lucide-react';
import type { ComposerSession } from '@/lib/roadmap/composer/schemas';

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email:    'email',
  linkedin: 'LinkedIn',
};

const MODE_LABELS: Record<string, string> = {
  single:   'single message',
  batch:    'batch messages',
  sequence: 'sequence messages',
};

export interface ComposerSessionReviewProps {
  /** The composerSession from the task, typed broadly so the caller
   *  can pass the raw JSON field without a cast. */
  session: Record<string, unknown>;
}

/**
 * ComposerSessionReview
 *
 * Renders the persistent summary of a completed Composer session on the
 * task card. Collapsed by default; expands to show the first message body.
 * Message count and sent count are surfaced inline.
 */
export function ComposerSessionReview({ session }: ComposerSessionReviewProps) {
  const [expanded, setExpanded] = useState(false);

  const typed      = session as Partial<ComposerSession>;
  const channel    = typed.channel ?? 'email';
  const mode       = typed.mode    ?? 'single';
  const messages   = typed.output?.messages ?? [];
  const sentCount  = typed.sentMessages?.length ?? 0;
  const firstBody  = messages[0]?.body;
  const channelLabel = CHANNEL_LABELS[channel as string] ?? channel;
  const modeLabel    = MODE_LABELS[mode as string] ?? mode;

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
            Drafted {messages.length} {channelLabel} {modeLabel}
          </p>
          {sentCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-success">
              <SendHorizonal className="size-3" />
              {sentCount} sent
            </span>
          )}
        </div>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        </motion.span>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && firstBody && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 pt-3">
                First message
              </p>
              <p className="text-[11px] text-foreground whitespace-pre-wrap rounded-md bg-background border border-border px-2.5 py-2 leading-relaxed">
                {firstBody}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
