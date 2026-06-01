'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { OpportunityEvaluation } from '@/lib/ideation/stage4-opportunities/schema';
import { MAX_VERDICT_PUSHBACK_ROUNDS } from '@/lib/ideation/stage4-opportunities/constants';
import type {
  OpportunityPushbackAction,
  OpportunityPushbackMode,
} from '@neuralaunch/constants';

export interface VerdictPushbackResult {
  action:      OpportunityPushbackAction;
  mode:        OpportunityPushbackMode;
  message:     string;
  opportunity: OpportunityEvaluation;
  version:     number;
}

export interface VerdictPushbackDrawerProps {
  opportunity: OpportunityEvaluation;
  onPushback:  (input: { opportunityId: string; message: string; priorVersion: number }) => Promise<VerdictPushbackResult>;
  onClose:     () => void;
}

/**
 * Per-opportunity verdict-pushback drawer. Mirror of Stage 3's
 * PainPointPushbackDrawer — local round history, send form, optimistic
 * lock via the engine's returned version, closes on 'closing' action
 * or hard-cap. Same UX shape so founders who used Stage 3 pushback
 * recognise this surface.
 */
export function VerdictPushbackDrawer({ opportunity, onPushback, onClose }: VerdictPushbackDrawerProps) {
  const [message, setMessage]                 = useState('');
  const [busy, startTransition]               = useTransition();
  const [error, setError]                     = useState<string | null>(null);
  const [pendingVersion, setPendingVersion]   = useState<number>(opportunity.pushbackVersion);
  const [closed, setClosed]                   = useState<boolean>(
    opportunity.pushbackHistory.some(h => h.agentAction === 'closing'),
  );

  const history = opportunity.pushbackHistory;
  const atCap   = history.length >= MAX_VERDICT_PUSHBACK_ROUNDS;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim().length === 0) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await onPushback({
          opportunityId: opportunity.id,
          message:       message.trim(),
          priorVersion:  pendingVersion,
        });
        setPendingVersion(result.version);
        setMessage('');
        if (result.action === 'closing') setClosed(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pushback round failed');
      }
    });
  };

  return (
    <div className="mt-4 border-t border-rule pt-3.5" role="region" aria-label="Verdict pushback drawer">
      <header className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Push back · on this verdict
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close pushback drawer"
          className="p-1 text-muted transition-colors hover:text-accent"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      </header>

      {history.length > 0 && (
        <ol className="mb-4 flex flex-col gap-2.5">
          {history.map((h, i) => (
            <li key={i} className="flex flex-col gap-1.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Round {h.round} · {h.agentMode} · {h.agentAction}
              </p>
              <div className="border-l-2 border-accent bg-bg-2 px-3 py-2 text-[13px] leading-snug text-fg">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">You · </span>
                {h.founderMessage}
              </div>
              <div className="border-l-2 border-rule-strong bg-bg-2 px-3 py-2 text-[13px] leading-snug text-fg">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-2">Agent · </span>
                {h.agentMessage}
              </div>
            </li>
          ))}
        </ol>
      )}

      {!closed && !atCap && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            disabled={busy}
            maxLength={2000}
            rows={2}
            placeholder="What did we get wrong about this verdict?"
            className="w-full resize-none border border-rule bg-bg px-3 py-2 text-[14px] text-fg placeholder:text-muted outline-none focus:border-accent"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Round {history.length + 1} / {MAX_VERDICT_PUSHBACK_ROUNDS}
            </span>
            <button
              type="submit"
              disabled={busy || message.trim().length === 0}
              className="inline-flex items-center gap-2 bg-accent px-3.5 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
            >
              {busy ? 'Sending…' : 'Send'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
          </div>
          {error && (
            <p className="border-l-2 border-amber bg-bg-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
              {error}
            </p>
          )}
        </form>
      )}
      {(closed || atCap) && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Pushback closed · set your own verdict above, or drop this opportunity.
        </p>
      )}
    </div>
  );
}
