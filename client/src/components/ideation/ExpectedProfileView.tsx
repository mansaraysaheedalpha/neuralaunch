'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExpectedProfileEntry } from '@/lib/ideation';
import type { ExpectedProfilePushbackAction } from '@neuralaunch/constants';
import { EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND } from '@/lib/ideation';
import { SKILL_LABELS, TIER_LABEL } from './labels';
import { PushbackDrawer } from './PushbackDrawer';

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

/**
 * Renders the derived Expected Profile entries. Each entry has a
 * "question this" affordance that opens an inline PushbackDrawer —
 * up to EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND rounds.
 *
 * The drawer (separate file) owns its local state; the parent
 * passes the API call through via `onPushback`. The engine returns
 * `status='closed'` on closing-move OR hard-cap; the drawer reads
 * that to switch into read-only mode.
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
