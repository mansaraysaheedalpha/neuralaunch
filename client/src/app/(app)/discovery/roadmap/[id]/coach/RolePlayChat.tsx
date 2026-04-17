'use client';
// src/app/(app)/discovery/roadmap/[id]/coach/RolePlayChat.tsx
// Amber-tinted rehearsal chat. Other party's name shown as agent identity.
// POSTs to the task-level roleplay route. Capped at ROLEPLAY_HARD_CAP_TURNS.

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Send, Swords, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { RolePlayTurn } from '@/lib/roadmap/coach/schemas';
// Import directly from constants, not the barrel — the barrel
// re-exports server-only engine modules that webpack traces.
import { ROLEPLAY_HARD_CAP_TURNS, ROLEPLAY_WARNING_TURN } from '@/lib/roadmap/coach/constants';

export interface RolePlayChatProps {
  roadmapId:      string;
  taskId:         string;
  otherPartyName: string;
  onEnd:          () => void;
}

/** Rehearsal chat. Calls onEnd when capped or founder ends early. */
export function RolePlayChat({
  roadmapId,
  taskId,
  otherPartyName,
  onEnd,
}: RolePlayChatProps) {
  const [history,    setHistory]    = useState<RolePlayTurn[]>([]);
  const [draft,      setDraft]      = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [capped,     setCapped]     = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentTurn = Math.ceil(history.length / 2) + (submitting ? 1 : 0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, submitting]);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || submitting || capped) return;

    const founderTurn: RolePlayTurn = {
      role:    'founder',
      message: trimmed,
      turn:    Math.floor(history.length / 2) + 1,
    };

    setHistory(prev => [...prev, founderTurn]);
    setDraft('');
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/coach/roleplay`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            message: trimmed,
            history: history.map(t => ({ role: t.role, message: t.message, turn: t.turn })),
          }),
        },
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not send. Please try again.');
        setHistory(prev => prev.slice(0, -1));
        return;
      }

      const json = await res.json() as {
        message: string;
        turn:    number;
        capped:  boolean;
      };

      if (json.capped) {
        setCapped(true);
      } else {
        // Construct the proper RolePlayTurn from the flat response
        const otherPartyTurn: RolePlayTurn = {
          role:    'other_party',
          message: json.message,
          turn:    json.turn,
        };
        setHistory(prev => [...prev, otherPartyTurn]);
      }
    } catch {
      setError('Network error — please try again.');
      setHistory(prev => prev.slice(0, -1));
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, capped, history, roadmapId, taskId]);

  const turnDisplay = `Turn ${Math.max(currentTurn, 1)}/${ROLEPLAY_HARD_CAP_TURNS}`;
  const nearCap = currentTurn >= ROLEPLAY_WARNING_TURN && !capped;

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-gold/40 bg-gold/5 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="size-3.5 text-gold" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gold">
            Rehearsal Mode
          </span>
          <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold text-gold">
            {turnDisplay}
          </span>
        </div>
        <button
          type="button"
          onClick={onEnd}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-3" />
          End rehearsal
        </button>
      </div>

      <p className="text-[10px] text-gold/70">
        Practising with: <span className="font-semibold">{otherPartyName}</span>
      </p>

      {/* Message list */}
      <div ref={scrollRef} className="flex flex-col gap-2 max-h-72 overflow-y-auto rounded-md border border-gold/20 bg-background px-3 py-3">
        {history.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">Start with your opening — type what you would say or send.</p>
        )}
        <AnimatePresence initial={false}>
          {history.map((turn, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
              className={['rounded-lg px-2.5 py-1.5 text-[11px] break-words whitespace-pre-wrap max-w-[88%]',
                turn.role === 'founder' ? 'self-end bg-primary/10 text-foreground' : 'self-start bg-gold/10 border border-gold/20 text-foreground/90',
              ].join(' ')}
            >
              {turn.role === 'other_party' && (
                <p className="text-[9px] font-semibold text-gold mb-0.5 uppercase tracking-wide">{otherPartyName}</p>
              )}
              {turn.message}
            </motion.div>
          ))}
        </AnimatePresence>
        {submitting && (
          <div className="self-start flex items-center gap-1.5 text-[11px] text-gold">
            <Loader2 className="size-3 animate-spin" /><span>{otherPartyName} is responding…</span>
          </div>
        )}
      </div>

      {/* Warning / cap banner */}
      {nearCap && (
        <p className="text-[10px] text-gold font-medium">
          {ROLEPLAY_HARD_CAP_TURNS - currentTurn + 1} turns remaining.
        </p>
      )}
      {capped && (
        <div className="rounded-md bg-gold/10 border border-gold/30 px-3 py-2.5 text-[11px] text-gold font-medium">
          Rehearsal complete — you&apos;ve used all {ROLEPLAY_HARD_CAP_TURNS} turns.
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-500">{error}</p>
      )}

      {!capped && (
        <div className="flex gap-2">
          <Input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder="Type what you would say…" disabled={submitting}
            className="flex-1 border-gold/30 px-2 py-1.5 text-xs focus-visible:ring-gold/30 focus-visible:border-gold/50"
          />
          <button type="button" onClick={() => { void handleSend(); }} disabled={draft.trim().length === 0 || submitting}
            className="shrink-0 rounded-md bg-gold px-2.5 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50">
            {submitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
          </button>
        </div>
      )}
      {capped && (
        <button type="button" onClick={onEnd}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
          Continue to debrief →
        </button>
      )}
    </div>
  );
}
