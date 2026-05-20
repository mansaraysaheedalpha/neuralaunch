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
 *
 * TODO(copy): drawer header, reply placeholder, hard-cap closed
 * notice all need product-voice review.
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
    <div className="mt-3 rounded-md border border-border bg-background/60 px-3 py-3" role="region" aria-label="Verdict pushback drawer">
      <header className="flex items-center justify-between mb-2">
        {/* TODO(copy): drawer header phrasing */}
        <span className="text-xs font-medium text-foreground">Push back on the verdict</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close pushback drawer"
          className="p-1 rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </header>

      {history.length > 0 && (
        <ol className="space-y-2 mb-3">
          {history.map((h, i) => (
            <li key={i} className="text-xs space-y-1">
              <div className="text-muted-foreground">
                Round {h.round} <span className="text-xs">({h.agentMode}, {h.agentAction})</span>
              </div>
              <div className="rounded bg-card/40 px-2 py-1 text-foreground">
                <span className="text-muted-foreground">you:</span> {h.founderMessage}
              </div>
              <div className="rounded bg-primary/5 px-2 py-1 text-foreground">
                <span className="text-muted-foreground">agent:</span> {h.agentMessage}
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
            placeholder="What is the agent getting wrong about this verdict?"
            className="w-full resize-none rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Round {history.length + 1} of {MAX_VERDICT_PUSHBACK_ROUNDS}
            </span>
            <Button type="submit" size="sm" disabled={busy || message.trim().length === 0}>
              {busy ? 'Sending…' : 'Send'}
            </Button>
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
        </form>
      )}
      {(closed || atCap) && (
        /* TODO(copy): closed-drawer notice */
        <div className="text-xs text-muted-foreground italic">
          Pushback closed. Set your own verdict above if you accept the agent&apos;s call, or drop this opportunity.
        </div>
      )}
    </div>
  );
}
