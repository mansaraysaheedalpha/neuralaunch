'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExpectedProfileEntry } from '@/lib/ideation';
import type { ExpectedProfilePushbackAction } from '@neuralaunch/constants';
import { EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND } from '@/lib/ideation';

interface ExpectedProfileViewProps {
  entries: ExpectedProfileEntry[];
  /** True when the row is committed — pushback is read-only. */
  readOnly?: boolean;
  /** Returns the agent's response so the drawer can render it. */
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
}

const SKILL_LABELS: Record<string, string> = {
  sales:                            'Sales',
  graphic_design:                   'Graphic Design',
  product_design:                   'Product Design',
  content_creative:                 'Content / Creative',
  marketing:                        'Marketing',
  public_speaking:                  'Public Speaking',
  technical_literacy:               'Technical Literacy',
  programming:                      'Programming',
  finance:                          'Finance',
  operational_efficiency:           'Operational Efficiency',
  leadership:                       'Leadership',
  ai_literacy:                      'AI Literacy',
  data_analysis:                    'Data Analysis',
  distribution_community_building:  'Distribution / Community',
};

const TIER_LABEL: Record<string, string> = {
  good:       'Good',
  acceptable: 'Acceptable',
  bad:        'Bad',
  unknown:    'Unknown',
};

/**
 * Renders the derived Expected Profile entries. Each entry has a
 * "question this" affordance that opens an inline pushback drawer —
 * up to 5 rounds, capped by EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND.
 *
 * The drawer holds local state; the parent owns the API call via
 * onPushback. The drawer closes when the engine returns status='closed'
 * (closing move or hard cap) or when the founder dismisses it.
 */
export function ExpectedProfileView({ entries, readOnly = false, onPushback }: ExpectedProfileViewProps) {
  return (
    <ul className="space-y-3">
      {entries.map((entry, i) => (
        <EntryRow
          key={`${entry.skill}-${i}`}
          entryIndex={i}
          entry={entry}
          readOnly={readOnly}
          onPushback={onPushback}
        />
      ))}
    </ul>
  );
}

interface EntryRowProps {
  entryIndex: number;
  entry:      ExpectedProfileEntry;
  readOnly:   boolean;
  onPushback: ExpectedProfileViewProps['onPushback'];
}

function EntryRow({ entryIndex, entry, readOnly, onPushback }: EntryRowProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isClosed = entry.pushback?.status === 'closed';
  const rounds = entry.pushback?.history.length ?? 0;

  return (
    <li className="rounded-lg border border-border bg-card/40 px-4 py-3">
      <header className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">
            {SKILL_LABELS[entry.skill] ?? entry.skill}
          </span>
          <span className="text-xs text-muted-foreground">
            requires {TIER_LABEL[entry.requiredTier] ?? entry.requiredTier}
          </span>
          {entry.critical && (
            <span className="text-xs font-medium text-gold">critical</span>
          )}
        </div>
        {!readOnly && !isClosed && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setDrawerOpen(o => !o)}
          >
            <MessageCircle className="size-3 mr-1" />
            Question this
            {rounds > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">({rounds}/{EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND})</span>
            )}
          </Button>
        )}
        {isClosed && (
          <span className="text-xs text-muted-foreground italic">pushback closed</span>
        )}
      </header>

      <p className="text-sm text-foreground leading-relaxed">
        {entry.reasoning || <span className="text-muted-foreground italic">(no reasoning generated)</span>}
      </p>

      {entry.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.sources.map((s, j) => (
            <span key={j} className="text-xs rounded-full border border-border bg-background/60 px-2 py-0.5 text-muted-foreground">
              {s}
            </span>
          ))}
        </div>
      )}

      {drawerOpen && (
        <PushbackDrawer
          entryIndex={entryIndex}
          entry={entry}
          onPushback={onPushback}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </li>
  );
}

interface PushbackDrawerProps {
  entryIndex: number;
  entry:      ExpectedProfileEntry;
  onPushback: ExpectedProfileViewProps['onPushback'];
  onClose:    () => void;
}

function PushbackDrawer({ entryIndex, entry, onPushback, onClose }: PushbackDrawerProps) {
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
        const result = await onPushback({ entryIndex, message: message.trim(), priorVersion: pendingVersion });
        setPendingVersion(result.version);
        setMessage('');
        if (result.status === 'closed') {
          // Leave the drawer open so the founder reads the closing
          // message; they can dismiss when ready.
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pushback round failed');
      }
    });
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-background/60 px-3 py-3">
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
