'use client';
// src/app/(app)/discovery/recommendation/PushbackChat.tsx

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, SendHorizontal } from 'lucide-react';

// Match the JSON shape persisted in Recommendation.pushbackHistory
interface PushbackTurnUser {
  role:      'user';
  content:   string;
  round:     number;
  timestamp: string;
}
interface PushbackTurnAgent {
  role:      'agent';
  content:   string;
  round:     number;
  mode?:     string;
  action?:   string;
  converging?: boolean;
  timestamp: string;
}
type PushbackTurn = PushbackTurnUser | PushbackTurnAgent;

interface PushbackChatProps {
  recommendationId: string;
  initialHistory:   PushbackTurn[];
  hardCapRound:     number;
  /** True when the alternative recommendation has already been generated. */
  alternativeReady: boolean;
  /** True when this recommendation has been accepted. */
  accepted:         boolean;
  /**
   * Notifies the parent that the recommendation has been refined or
   * replaced. Triggers a router.refresh() so the recommendation card
   * above re-renders with the new content.
   */
  onCommit: () => void;
}

/**
 * PushbackChat
 *
 * Inline conversation widget below the recommendation card. The founder
 * types pushback messages, the agent streams back structured responses
 * (continue_dialogue / defend / refine / replace / closing), and the
 * full transcript persists to Recommendation.pushbackHistory.
 *
 * Acceptance is a separate explicit action handled by the parent — this
 * component is only the conversation surface. Posting a new pushback
 * message after acceptance auto-un-accepts on the server side; the
 * parent will refresh and reflect the change.
 */
export function PushbackChat({
  recommendationId,
  initialHistory,
  hardCapRound,
  alternativeReady,
  accepted,
  onCommit,
}: PushbackChatProps) {
  const router = useRouter();
  const [history, setHistory] = useState<PushbackTurn[]>(initialHistory);
  const [input,   setInput]   = useState('');
  const [pending, setPending] = useState(false);
  const [error,   setError]   = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Saved selection range from the most recent send attempt — restored
  // on rollback so a long pushback message keeps the cursor where the
  // founder left it. Cosmetic but important on long messages.
  const savedSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const userTurns = history.filter(t => t.role === 'user').length;
  const remaining = hardCapRound - userTurns;
  const capReached = userTurns >= hardCapRound || alternativeReady;

  // Auto-scroll to the latest message after each turn
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length]);

  /**
   * Roll back an optimistic send when the request fails. Restores the
   * input text AND the cursor position the founder had when they hit
   * send. requestAnimationFrame is required because setInput triggers
   * a render and the textarea's value isn't updated until after that.
   */
  function rollbackOptimisticSend(text: string) {
    setHistory(prev => prev.slice(0, -1));
    setInput(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      const sel = savedSelectionRef.current;
      if (el && sel) {
        el.focus();
        try {
          el.setSelectionRange(sel.start, sel.end);
        } catch { /* Safari edge case — focus alone is fine */ }
      }
    });
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || pending || capReached) return;

    // Capture selection before clearing the input — used by rollback
    if (textareaRef.current) {
      savedSelectionRef.current = {
        start: textareaRef.current.selectionStart,
        end:   textareaRef.current.selectionEnd,
      };
    }

    setPending(true);
    setError('');

    // Optimistic user bubble
    const userTurn: PushbackTurnUser = {
      role:      'user',
      content:   text,
      round:     userTurns + 1,
      timestamp: new Date().toISOString(),
    };
    setHistory(prev => [...prev, userTurn]);
    setInput('');

    try {
      const res = await fetch(`/api/discovery/recommendations/${recommendationId}/pushback`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        rollbackOptimisticSend(text);
        setError(json.error ?? 'Could not send your message. Please try again.');
        return;
      }

      const data = await res.json() as {
        agent: PushbackTurnAgent;
        committed?: boolean;
        closing?: boolean;
      };

      setHistory(prev => [...prev, data.agent]);

      if (data.committed) {
        // The agent refined or replaced the recommendation — refresh
        // the parent server component so the card above re-renders
        onCommit();
        router.refresh();
      }

      if (data.closing) {
        // Round-7 closing message just landed; the alternative
        // recommendation will appear once the Inngest worker finishes.
        // Bump the route once so the parent picks up state changes.
        router.refresh();
      }
    } catch {
      rollbackOptimisticSend(text);
      setError('Network error — please try again.');
    } finally {
      setPending(false);
    }
  }

  // ----- Render -----

  if (alternativeReady) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs text-foreground leading-relaxed">
          The discussion is closed. An alternative recommendation has been generated based on
          what you argued for. Compare both above and accept the one you want to commit to.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Push back on this recommendation
        </p>
        {history.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Round {userTurns}/{hardCapRound}
            {remaining > 0 && remaining <= 2 && !capReached ? ` · ${remaining} left` : null}
          </p>
        )}
      </div>

      {/* Conversation */}
      {history.length > 0 && (
        <div
          ref={scrollRef}
          className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1"
        >
          {history.map((turn, i) => (
            <div
              key={`${turn.round}-${i}`}
              className={[
                'rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed max-w-[88%] whitespace-pre-wrap',
                turn.role === 'user'
                  ? 'self-end bg-primary text-primary-foreground'
                  : 'self-start bg-muted text-foreground',
              ].join(' ')}
            >
              {turn.content}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Disagree with something in this recommendation? Type your concern and I will engage
          honestly — defending where I think the recommendation is right, refining where I
          missed something, or replacing it if your objection exposes a real flaw.
        </p>
      )}

      {/* Acceptance reminder when in chat after a prior accept */}
      {accepted && history.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-foreground/80">
          Posting a new message will reopen the discussion and undo your earlier acceptance.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Input */}
      {!capReached && (
        <div className="flex gap-2 items-end rounded-lg border border-border bg-background px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Share your concern…"
            disabled={pending}
            rows={2}
            className="flex-1 resize-none bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            type="button"
            onClick={() => { void handleSend(); }}
            disabled={pending || input.trim().length === 0}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Send"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          </button>
        </div>
      )}

      {capReached && !alternativeReady && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-foreground/80">
          You have reached the discussion cap. Generating the alternative path you argued for —
          it will appear above this conversation in a few minutes. Then you can compare both
          and accept the one you want.
        </div>
      )}
    </div>
  );
}
