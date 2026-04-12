'use client';
// src/app/(app)/discovery/roadmap/[id]/coach/CoachSetupChat.tsx
//
// 1-3 turn setup conversation. The founder confirms or adjusts the
// pre-populated task context, adds the missing pieces (who specifically,
// fear, channel), and the Coach produces a ConversationSetup when
// complete. Mirrors the TaskDiagnosticChat bubble styling.

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Send } from 'lucide-react';
import type { ConversationSetup } from '@/lib/roadmap/coach';

interface SetupExchange {
  role:    'founder' | 'agent';
  message: string;
}

export interface CoachSetupChatProps {
  roadmapId:       string;
  taskId:          string;
  onSetupComplete: (setup: ConversationSetup) => void;
  onCancel:        () => void;
}

/**
 * CoachSetupChat
 *
 * Owns the 1-3 exchange situation-gathering conversation. Each submit
 * POSTs to the task-level coach setup route. When the server returns
 * `status: 'ready'`, calls `onSetupComplete` with the completed
 * ConversationSetup so the parent can advance to the preparation stage.
 */
export function CoachSetupChat({
  roadmapId,
  taskId,
  onSetupComplete,
  onCancel,
}: CoachSetupChatProps) {
  const [exchanges,  setExchanges]  = useState<SetupExchange[]>([]);
  const [draft,      setDraft]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || submitting) return;

    const next: SetupExchange = { role: 'founder', message: trimmed };
    setExchanges(prev => [...prev, next]);
    setDraft('');
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/coach/setup`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            message:  trimmed,
            history:  exchanges.map(ex => ({ role: ex.role, message: ex.message })),
          }),
        },
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not send. Please try again.');
        setExchanges(prev => prev.slice(0, -1));
        return;
      }

      const json = await res.json() as {
        status:  'gathering' | 'ready';
        message: string;
        setup?:  ConversationSetup;
      };

      setExchanges(prev => [...prev, { role: 'agent', message: json.message }]);

      if (json.status === 'ready' && json.setup) {
        onSetupComplete(json.setup);
      }
    } catch {
      setError('Network error — please try again.');
      setExchanges(prev => prev.slice(0, -1));
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, exchanges, roadmapId, taskId, onSetupComplete]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-background px-3 py-3 flex flex-col gap-2 max-h-72 overflow-y-auto">
        {exchanges.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">
            Setting up your preparation — describe the situation and I will
            help you prepare.
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
          placeholder="Describe the conversation you need to have…"
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
