'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExpectedProfileEntry } from '@/lib/ideation';
import type { ExpectedProfilePushbackAction } from '@neuralaunch/constants';
import { EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND } from '@/lib/ideation';

export interface PushbackDrawerProps {
  entryIndex: number;
  entry:      ExpectedProfileEntry;
  onPushback: (args: {
    entryIndex:   number;
    message:      string;
    priorVersion: number;
  }) => Promise<{
    action:  ExpectedProfilePushbackAction;
    message: string;
    entry:   ExpectedProfileEntry;
    version: number;
    status:  'open' | 'closed';
  }>;
  onClose: () => void;
}

/**
 * Inline pushback drawer for a single Expected Profile entry. Owns
 * local round-history rendering + the per-round submit form. The
 * parent (`ExpectedProfileView`) hands off the API call via
 * `onPushback`; on engine response we track the new `version` and
 * leave the drawer open so the founder can read the closing message
 * before dismissing.
 *
 * Capped at EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND rounds (the
 * engine itself coerces the action to 'closing' on the cap turn).
 */
export function PushbackDrawer({
  entryIndex,
  entry,
  onPushback,
  onClose,
}: PushbackDrawerProps) {
  const [message, setMessage] = useState('');
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingVersion, setPendingVersion] = useState<number>(entry.pushback?.version ?? 0);

  const history = entry.pushback?.history ?? [];
  const closed = entry.pushback?.status === 'closed';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim().length === 0) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await onPushback({
          entryIndex,
          message:      message.trim(),
          priorVersion: pendingVersion,
        });
        setPendingVersion(result.version);
        setMessage('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pushback round failed');
      }
    });
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-background/60 px-3 py-3" role="region" aria-label="Pushback drawer">
      <header className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-foreground">Pushback drawer</span>
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

      {!closed && (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            disabled={busy}
            maxLength={2000}
            rows={2}
            placeholder="Push back on this requirement — what does the agent have wrong?"
            className="w-full resize-none rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Round {history.length + 1} of {EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND}
            </span>
            <Button type="submit" size="sm" disabled={busy || message.trim().length === 0}>
              {busy ? 'Sending…' : 'Send'}
            </Button>
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
        </form>
      )}
      {closed && (
        <div className="text-xs text-muted-foreground italic">
          Pushback closed for this entry. Use the canvas above to update your skill levels, or commit the document if you accept this requirement as-is.
        </div>
      )}
    </div>
  );
}
