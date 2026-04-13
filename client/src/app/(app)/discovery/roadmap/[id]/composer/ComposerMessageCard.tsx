'use client';
// src/app/(app)/discovery/roadmap/[id]/composer/ComposerMessageCard.tsx
//
// A single outreach message card. Renders body (or latest variation),
// annotation, subject/placeholder header, sequence timing, and action
// buttons: copy, regenerate (with remaining count), mark-as-sent toggle,
// and the Coach handoff link when suggestedTool is present.

import { useState, useCallback } from 'react';
import { Copy, Check, RefreshCw, SendHorizonal, Link2 } from 'lucide-react';
import type { ComposerMessage } from '@/lib/roadmap/composer/schemas';
import { MAX_REGENERATIONS_PER_MESSAGE } from '@/lib/roadmap/composer/constants';

export interface ComposerMessageCardProps {
  message:      ComposerMessage;
  roadmapId:    string;
  taskId:       string;
  isSent:       boolean;
  onMarkSent:   (id: string) => void;
  onRegenerate: (id: string) => void;
}

/**
 * ComposerMessageCard
 *
 * Stateless-ish card for one generated outreach message. Copy, regenerate,
 * mark-sent and Coach-handoff actions are surfaced inline. The copy action
 * shows the latest variation body if variations exist.
 */
export function ComposerMessageCard({
  message,
  isSent,
  onMarkSent,
  onRegenerate,
}: ComposerMessageCardProps) {
  const [copied, setCopied] = useState(false);
  const variationsUsed = message.variations?.length ?? 0;
  const canRegenerate  = variationsUsed < MAX_REGENERATIONS_PER_MESSAGE;
  const remainingLabel = canRegenerate
    ? `${MAX_REGENERATIONS_PER_MESSAGE - variationsUsed} left`
    : 'No more';

  const activeBody = message.variations?.length
    ? message.variations[message.variations.length - 1].body
    : message.body;

  const activeSubject = message.variations?.length
    ? (message.variations[message.variations.length - 1].subject ?? message.subject)
    : message.subject;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(activeBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }, [activeBody]);

  return (
    <div className="rounded-lg border border-border bg-background flex flex-col gap-0 overflow-hidden">
      {/* Header: subject (email) or placeholder (batch) */}
      {(activeSubject ?? message.recipientPlaceholder) && (
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          {activeSubject && (
            <p className="text-[11px] font-medium text-foreground">
              Subject: {activeSubject}
            </p>
          )}
          {message.recipientPlaceholder && !activeSubject && (
            <p className="text-[11px] font-medium text-foreground">
              {message.recipientPlaceholder}
            </p>
          )}
        </div>
      )}

      {/* Send timing (sequence mode) */}
      {message.sendTiming && (
        <div className="px-3 py-1.5 bg-primary/5 border-b border-primary/10">
          <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">
            {message.sendTiming}
          </p>
          {message.escalationNote && (
            <p className="text-[10px] text-muted-foreground italic">{message.escalationNote}</p>
          )}
        </div>
      )}

      {/* Message body */}
      <div className="px-3 py-3">
        <p className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">{activeBody}</p>
      </div>

      {/* Annotation */}
      <div className="px-3 pb-2">
        <p className="text-[10px] text-muted-foreground italic border-t border-border pt-2">
          {message.annotation}
        </p>
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { void handleCopy(); }}
          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 transition-colors"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>

        <button
          type="button"
          onClick={() => onRegenerate(message.id)}
          disabled={!canRegenerate}
          className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className="size-3" />
          Try a different angle ({remainingLabel})
        </button>

        <button
          type="button"
          onClick={() => onMarkSent(message.id)}
          className={[
            'flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] transition-colors',
            isSent
              ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400'
              : 'border-border text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <SendHorizonal className="size-3" />
          {isSent ? 'Sent' : 'Mark as sent'}
        </button>

        {message.suggestedTool === 'conversation_coach' && (
          <a
            href="/tools/conversation-coach"
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <Link2 className="size-3" />
            Prepare for this conversation →
          </a>
        )}
      </div>
    </div>
  );
}
