'use client';
// src/app/(app)/discovery/roadmap/[id]/composer/ComposerOutputView.tsx
//
// Renders the generated outreach messages, adapted per mode:
//   single   — one message card
//   batch    — scrollable list with copy-all option
//   sequence — stacked Day 1/5/14 cards with timing headers

import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Copy } from 'lucide-react';
import type { ComposerOutput, ComposerMessage } from '@/lib/roadmap/composer/schemas';
import type { ComposerChannel, ComposerMode } from '@/lib/roadmap/composer/constants';
import { ComposerMessageCard } from './ComposerMessageCard';

export interface ComposerOutputViewProps {
  output:    ComposerOutput;
  channel:   ComposerChannel;
  mode:      ComposerMode;
  roadmapId: string;
  taskId:    string;
  /**
   * Present when the component is rendered inside the standalone
   * /tools/outreach-composer page. Causes regenerate + mark-sent to
   * hit the session-id-based standalone routes (which read/write
   * roadmap.toolSessions) instead of the task-launched routes (which
   * read/write roadmap.phases[*].tasks[*].composerSession). Task-
   * launched callers leave this undefined and still work as before.
   */
  sessionId?: string;
  onDone:    () => void;
  /** Fired after a regenerate call completes (success or error). */
  onToolCallComplete?: () => void;
}

/**
 * ComposerOutputView
 *
 * Renders the generated messages with per-mode layout. Single mode shows
 * one card. Batch shows a scrollable list with copy-all. Sequence shows
 * stacked Day cards in order. Delegates each card to ComposerMessageCard.
 */
export function ComposerOutputView({
  output,
  channel,
  mode,
  roadmapId,
  taskId,
  sessionId,
  onDone,
  onToolCallComplete,
}: ComposerOutputViewProps) {
  const [messages, setMessages] = useState<ComposerMessage[]>(output.messages);
  const [sentIds,  setSentIds]  = useState<Set<string>>(new Set());
  const [regenErr, setRegenErr] = useState<string | null>(null);

  // Standalone mode uses the session-id-based routes; task-launched
  // mode uses the taskId-scoped routes. The two routes read/write
  // different places (toolSessions vs phases[*].tasks[*]), so the
  // endpoint has to match the session shape.
  const standalone       = Boolean(sessionId);
  const regenerateUrl    = standalone
    ? `/api/discovery/roadmaps/${roadmapId}/composer/regenerate`
    : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer/regenerate`;
  const markSentUrl      = standalone
    ? `/api/discovery/roadmaps/${roadmapId}/composer/mark-sent`
    : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer/mark-sent`;

  const handleMarkSent = useCallback(async (id: string) => {
    if (sentIds.has(id)) return;
    setSentIds(prev => new Set([...prev, id]));
    try {
      await fetch(markSentUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(standalone
          ? { sessionId, messageId: id }
          : { messageId: id }),
      });
    } catch { /* optimistic — already shown as sent */ }
  }, [sentIds, markSentUrl, standalone, sessionId]);

  const handleRegenerate = useCallback(async (id: string, instruction: string) => {
    setRegenErr(null);
    try {
      const res = await fetch(regenerateUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(standalone
          ? { sessionId, messageId: id, instruction }
          : { messageId: id, instruction }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setRegenErr(json.error ?? 'Could not regenerate. Please try again.');
        return;
      }
      // The route returns { variation: { body, subject? } }, not a
      // full ComposerMessage. Append the variation to the existing
      // message's variations array locally.
      const json = await res.json() as { variation: { body: string; subject?: string } };
      setMessages(prev => prev.map(m => {
        if (m.id !== id) return m;
        return {
          ...m,
          variations: [
            ...(m.variations ?? []),
            { body: json.variation.body, subject: json.variation.subject, variationInstruction: instruction },
          ],
        };
      }));
    } catch {
      setRegenErr('Network error — please try again.');
    } finally {
      onToolCallComplete?.();
    }
  }, [regenerateUrl, standalone, sessionId, onToolCallComplete]);

  const handleCopyAll = useCallback(async () => {
    const allText = messages.map(m => m.body).join('\n\n---\n\n');
    try { await navigator.clipboard.writeText(allText); } catch { /* unavailable */ }
  }, [messages]);

  const modeLabel =
    mode === 'sequence' ? 'Follow-up sequence' :
    mode === 'batch'    ? `Batch (${messages.length} messages)` :
    'Message';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground capitalize">
          {modeLabel} · {channel}
        </p>
        {mode === 'batch' && messages.length > 1 && (
          <button
            type="button"
            onClick={() => { void handleCopyAll(); }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            <Copy className="size-3" />
            Copy all
          </button>
        )}
      </div>

      {regenErr && (
        <p className="text-[11px] text-red-500 rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-2">
          {regenErr}
        </p>
      )}

      <div className={mode === 'batch' ? 'flex flex-col gap-3 max-h-[28rem] overflow-y-auto pr-1' : 'flex flex-col gap-4'}>
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.15 }}
          >
            <ComposerMessageCard
              message={msg}
              roadmapId={roadmapId}
              taskId={taskId}
              isSent={sentIds.has(msg.id)}
              onMarkSent={(id) => { void handleMarkSent(id); }}
              onRegenerate={(id, instruction) => { void handleRegenerate(id, instruction); }}
            />
          </motion.div>
        ))}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="self-start rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        Done
      </button>
    </div>
  );
}
