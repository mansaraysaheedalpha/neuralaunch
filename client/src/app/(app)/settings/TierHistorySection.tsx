'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface TierHistoryEntry {
  id:              string;
  fromTier:        string | null;
  toTier:          string;
  paddleEventType: string | null;
  occurredAt:      string;
}

interface TierHistorySectionProps {
  transitions: TierHistoryEntry[];
  /**
   * Whether the user was ever a founding member. Only used to badge
   * historical transitions for display context — fetched from the
   * same User model row as the transitions themselves.
   */
  wasFoundingMember: boolean;
}

// Map the raw Paddle event type → a short human phrase for the UI.
// Falls back to the event type verbatim so an unmapped event still
// renders (rather than mysteriously blank).
function describeTransition(fromTier: string | null, toTier: string, eventType: string | null): string {
  const fromLabel = fromTier ? tierLabel(fromTier) : 'no subscription';
  const toLabel   = tierLabel(toTier);

  switch (eventType) {
    case 'subscription.created':
      return `Subscribed to ${toLabel}`;
    case 'subscription.canceled':
      return `Canceled — moved to ${toLabel}`;
    case 'subscription.paused':
      return `Paused — moved to ${toLabel}`;
    case 'subscription.updated':
    case 'subscription.activated':
    case 'subscription.resumed':
      if (toTier === 'free') return `${eventType.replace('subscription.', '')} — moved to Free`;
      if (fromTier === 'free' || !fromTier) return `Activated ${toLabel}`;
      if (tierRank(toTier) > tierRank(fromTier)) return `Upgraded from ${fromLabel} to ${toLabel}`;
      return `Changed plan from ${fromLabel} to ${toLabel}`;
    case 'transaction.payment_failed':
      return 'Payment failed — access suspended';
    case 'transaction.completed':
      return `Renewal succeeded — ${toLabel} restored`;
    case 'adjustment.created':
    case 'adjustment.updated':
      return toTier === 'free' ? 'Refunded — moved to Free' : `Adjustment — moved to ${toLabel}`;
    default:
      return `${fromLabel} → ${toLabel}`;
  }
}

function tierLabel(tier: string): string {
  if (tier === 'execute')  return 'Execute';
  if (tier === 'compound') return 'Compound';
  if (tier === 'free')     return 'Free';
  return tier;
}

function tierRank(tier: string): number {
  if (tier === 'compound') return 2;
  if (tier === 'execute')  return 1;
  return 0;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });
}

/**
 * Collapsible "Subscription history" panel. Hidden entirely when
 * the user has no transitions (first-time Free users). Otherwise
 * collapsed by default to avoid visual clutter; expands on click.
 */
export function TierHistorySection({ transitions, wasFoundingMember }: TierHistorySectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (transitions.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex w-full items-center justify-between text-left focus:outline-none"
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold text-foreground">
          Subscription history
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {transitions.length} {transitions.length === 1 ? 'change' : 'changes'}
          </span>
          {expanded
            ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
            : <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
        </span>
      </button>

      {expanded && (
        <ol className="mt-4 flex flex-col gap-3">
          {transitions.map(entry => {
            const isFoundingTransition =
              wasFoundingMember &&
              (entry.toTier === 'execute' || entry.toTier === 'compound') &&
              entry.paddleEventType === 'subscription.created';
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-0.5 border-l-2 border-slate-700 pl-3"
              >
                <p className="text-xs text-muted-foreground">
                  {formatDate(entry.occurredAt)}
                </p>
                <p className="text-xs text-foreground">
                  {describeTransition(entry.fromTier, entry.toTier, entry.paddleEventType)}
                  {isFoundingTransition && (
                    <span className="ml-2 inline-flex items-center rounded-full border border-gold/30 bg-gold/5 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                      Founding member
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
