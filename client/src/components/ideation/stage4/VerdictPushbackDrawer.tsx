'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <div className="mt-3 rounded-md border border-rule bg-bg/60 px-3 py-3" role="region" aria-label="Verdict pushback drawer">
      <header className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-fg">Push back on my verdict</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close pushback drawer"
          className="p-1 rounded text-muted hover:text-fg"
        >
          <X className="size-3" />
        </button>
      </header>

      {history.length > 0 && (
        <ol className="space-y-2 mb-3">
          {history.map((h, i) => (
            <li key={i} className="text-xs space-y-1">
              <div className="text-muted">
                Round {h.round} <span className="text-xs">({h.agentMode}, {h.agentAction})</span>
              </div>
              <div className="rounded bg-bg-2/40 px-2 py-1 text-fg">
                <span className="text-muted">you:</span> {h.founderMessage}
              </div>
              <div className="rounded bg-accent/5 px-2 py-1 text-fg">
                <span className="text-muted">agent:</span> {h.agentMessage}
              </div>
            </li>
          ))}
        </ol>
      )}

      {!closed && !atCap && (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            disabled={busy}
            maxLength={2000}
            rows={2}
            placeholder="What did I get wrong about this verdict?"
            className="w-full resize-none rounded-md border border-rule bg-bg/60 px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-accent/40"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">
              Round {history.length + 1} of {MAX_VERDICT_PUSHBACK_ROUNDS}
            </span>
            <Button type="submit" size="sm" disabled={busy || message.trim().length === 0}>
              {busy ? 'Sending…' : 'Send'}
            </Button>
          </div>
          {error && <div className="text-xs text-accent">{error}</div>}
        </form>
      )}
      {(closed || atCap) && (
        <div className="text-xs text-muted italic">
          Pushback closed. Set your own verdict above if you accept my call, or drop this opportunity.
        </div>
      )}
    </div>
  );
}
