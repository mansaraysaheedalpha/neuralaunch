'use client';
// src/app/(app)/discovery/roadmap/[id]/composer/ComposerContextChat.tsx
//
// 1-2 turn context collection for the Outreach Composer. Gathers who
// the founder is reaching out to, the goal, channel, and mode. POSTs
// each message to the composer generate route and calls onContextComplete
// when the server returns a completed context/mode/channel.

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Send } from 'lucide-react';
import type { OutreachContext } from '@/lib/roadmap/composer/schemas';
import type { ComposerChannel, ComposerMode } from '@/lib/roadmap/composer/constants';

interface ContextExchange {
  role:    'founder' | 'agent';
  message: string;
}

export interface ComposerContextChatProps {
  roadmapId:         string;
  taskId:            string;
  onContextComplete: (context: OutreachContext, mode: ComposerMode, channel: ComposerChannel) => void;
  onCancel:          () => void;
}

/**
 * ComposerContextChat
 *
 * Owns the 1-2 exchange context-gathering conversation for the Outreach
 * Composer. Each submit POSTs to the composer generate route. When the
 * server returns `status: 'ready'` with context/mode/channel, calls
 * `onContextComplete` so the parent can advance to generation.
 */
export function ComposerContextChat({
  roadmapId,
  taskId,
  onContextComplete,
  onCancel,
}: ComposerContextChatProps) {
  const [exchanges,  setExchanges]  = useState<ContextExchange[]>([]);
  const [draft,      setDraft]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || submitting) return;

    const next: ContextExchange = { role: 'founder', message: trimmed };
    setExchanges(prev => [...prev, next]);
    setDraft('');
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer/generate`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ message: trimmed }),
        },
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not send. Please try again.');
        setExchanges(prev => prev.slice(0, -1));
        return;
      }

      const json = await res.json() as {
        status:   'gathering' | 'ready';
        message:  string;
        context?: OutreachContext;
        mode?:    ComposerMode;
        channel?: ComposerChannel;
      };

      setExchanges(prev => [...prev, { role: 'agent', message: json.message }]);

      if (json.status === 'ready' && json.context && json.mode && json.channel) {
        onContextComplete(json.context, json.mode, json.channel);
      }
    } catch {
      setError('Network error — please try again.');
      setExchanges(prev => prev.slice(0, -1));
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, roadmapId, taskId, onContextComplete]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-background px-3 py-3 flex flex-col gap-2 max-h-72 overflow-y-auto">
        {exchanges.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">
            Tell me who you need to reach out to and what you want to achieve —
            I will draft ready-to-send messages for you.
          </p>
        )}
        <AnimatePresence initial={false}>
          {exchanges.map((ex, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={[
                'rounded-lg px-2.5 py-1.5 text-[11px] break-words whitespace-pre-wrap max-w-[88%]',
                ex.role === 'founder'
                  ? 'self-end bg-primary/10 text-foreground'
                  : 'self-start bg-muted text-foreground/90',
              ].join(' ')}
            >
              {ex.message}
            </motion.div>
          ))}
        </AnimatePresence>
        {submitting && (
          <div className="self-start flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span>Thinking…</span>
          </div>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-red-500">{error}</p>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Who are you reaching out to, and what's the goal?"
          disabled={submitting}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-50 outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={() => { void handleSend(); }}
          disabled={draft.trim().length === 0 || submitting}
          className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting
            ? <Loader2 className="size-3 animate-spin" />
            : <Send className="size-3" />
          }
        </button>
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="self-start text-[10px] text-muted-foreground hover:text-foreground underline"
      >
        Cancel
      </button>
    </div>
  );
}
