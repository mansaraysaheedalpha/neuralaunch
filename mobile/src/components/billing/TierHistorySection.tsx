// src/components/billing/TierHistorySection.tsx
//
// Mirror of the web's Settings > Subscription history panel. Fetches
// the last ten tier transitions via the mobile-facing
// `/api/user/tier-history` endpoint and renders them inside a
// CollapsibleSection so the list stays out of the way by default.
//
// Event-type → human-phrase translation is ported verbatim from
// client/src/app/(app)/settings/TierHistorySection.tsx so the copy
// stays aligned across platforms.

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Card, CollapsibleSection } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

interface TierHistoryEntry {
  id:              string;
  fromTier:        string | null;
  toTier:          string;
  paddleEventType: string | null;
  occurredAt:      string;
}

interface Response {
  wasFoundingMember: boolean;
  transitions:       TierHistoryEntry[];
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

function describeTransition(
  fromTier: string | null,
  toTier: string,
  eventType: string | null,
): string {
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
      if (toTier === 'free') {
        return `${(eventType ?? '').replace('subscription.', '')} — moved to Free`;
      }
      if (fromTier === 'free' || !fromTier) return `Activated ${toLabel}`;
      if (tierRank(toTier) > tierRank(fromTier)) {
        return `Upgraded from ${fromLabel} to ${toLabel}`;
      }
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });
}

export function TierHistorySection() {
  const { colors: c } = useTheme();
  const [data, setData] = useState<Response | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<Response>('/api/user/tier-history');
        if (!cancelled) setData(res);
      } catch { /* hide the section silently if the call fails */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data || data.transitions.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      {/* noPadding — CollapsibleSection owns its own header padding, so
          stacking Card's default 16pt on top of it doubles the vertical
          whitespace around the chevron. Apply the horizontal padding
          inline so the content still indents consistently. */}
      <Card noPadding style={styles.card}>
        <CollapsibleSection
          label={`Subscription history · ${data.transitions.length} ${data.transitions.length === 1 ? 'change' : 'changes'}`}
          defaultOpen={false}
        >
          <View style={styles.list}>
            {data.transitions.map(entry => {
              const isFoundingTransition =
                data.wasFoundingMember
                && (entry.toTier === 'execute' || entry.toTier === 'compound')
                && entry.paddleEventType === 'subscription.created';
              return (
                <View key={entry.id} style={[styles.entry, { borderLeftColor: c.border }]}>
                  <Text variant="caption" color={c.foreground}>
                    {describeTransition(entry.fromTier, entry.toTier, entry.paddleEventType)}
                  </Text>
                  <View style={styles.entryMeta}>
                    <Text variant="caption" color={c.mutedForeground}>
                      {formatDate(entry.occurredAt)}
                    </Text>
                    {isFoundingTransition && (
                      <View style={[styles.foundingBadge, { backgroundColor: c.secondaryAlpha10, borderColor: c.secondary }]}>
                        <Text variant="caption" color={c.secondary}>
                          Founding rate
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </CollapsibleSection>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing[2],
  },
  card: {
    paddingHorizontal: spacing[4],
  },
  list: {
    gap: spacing[3],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  entry: {
    borderLeftWidth: 2,
    paddingLeft: spacing[3],
    gap: spacing[0.5],
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  foundingBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
