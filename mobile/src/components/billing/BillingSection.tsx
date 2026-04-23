// src/components/billing/BillingSection.tsx
//
// Mobile counterpart to the web's Settings > Billing card. Renders
// the current tier, status line (renewal date, dunning/cancel notes
// when relevant), and a "Manage billing" CTA.
//
// Strategy note: mobile deliberately does not wrap the Paddle portal
// link or checkout flow natively — Apple / Google's policies around
// digital-subscription in-app purchases make that a separate sprint.
// For now "Manage billing" opens the web settings page in the in-app
// browser; the user's existing web session handles the authenticated
// portal round-trip.

import { useEffect, useState } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { ExternalLink, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, API_BASE_URL } from '@/services/api-client';
import { Text, Card, Badge } from '@/components/ui';
import { spacing, radius, iconSize } from '@/constants/theme';

export interface BillingOverview {
  tier:              'free' | 'execute' | 'compound';
  status:            string;
  isFoundingMember:  boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd:  string | null;
  hasBillingProfile: boolean;
  userName:          string | null;
  lastPaidTier:      'execute' | 'compound' | null;
  wasFoundingMember: boolean;
}

const TIER_LABEL = {
  free:     'Free',
  execute:  'Execute',
  compound: 'Compound',
} as const;

function formatRenewal(iso: string | null, cancelAtPeriodEnd: boolean): string | null {
  if (!iso) return null;
  const date = new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });
  return cancelAtPeriodEnd ? `Ends ${date}` : `Renews ${date}`;
}

/**
 * Fetch the overview once on mount and expose both data and setter so
 * the welcome-back banner (a separate component) can read the same
 * snapshot without issuing a second request. Parent owns the state.
 */
export function useBillingOverview() {
  const [data, setData] = useState<BillingOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<BillingOverview>('/api/user/billing-overview');
        if (!cancelled) setData(res);
      } catch { /* leave null — caller renders a skeleton or nothing */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return data;
}

interface Props {
  overview: BillingOverview | null;
}

export function BillingSection({ overview }: Props) {
  const { colors: c } = useTheme();

  if (!overview) return null;

  const { tier, status, isFoundingMember, cancelAtPeriodEnd, currentPeriodEnd } = overview;
  const renewalLine = formatRenewal(currentPeriodEnd, cancelAtPeriodEnd);

  async function handleManage() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Open the web settings page where the user's session already
    // exists. The existing Paddle-portal server action there mints
    // the ephemeral portal URL client-side on tap.
    await WebBrowser.openBrowserAsync(`${API_BASE_URL}/settings`);
  }

  const tierLabel = TIER_LABEL[tier];
  // Dunning / cancel notes mirror the web's status copy.
  const statusNote = (() => {
    if (tier === 'free') return null;
    if (status === 'past_due') return 'Payment failed — update your card to restore access.';
    if (status === 'paused') return 'Subscription is paused.';
    if (cancelAtPeriodEnd) return renewalLine;
    return renewalLine;
  })();

  return (
    <Card>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="overline" color={c.mutedForeground}>Current plan</Text>
          <View style={styles.tierRow}>
            <Text variant="title">{tierLabel}</Text>
            {isFoundingMember && (
              <View style={[styles.foundingBadge, { backgroundColor: c.secondaryAlpha10, borderColor: c.secondary }]}>
                <Sparkles size={iconSize.xs} color={c.secondary} />
                <Text variant="caption" color={c.secondary} style={{ fontWeight: '600' }}>
                  Founding member
                </Text>
              </View>
            )}
          </View>
          {statusNote && (
            <Text
              variant="caption"
              color={status === 'past_due' ? c.destructive : c.mutedForeground}
              style={{ marginTop: spacing[1] }}
            >
              {statusNote}
            </Text>
          )}
        </View>
        {tier !== 'free' && (
          <Badge label={status === 'active' ? 'Active' : status} variant={
            status === 'active'    ? 'success'
            : status === 'past_due' ? 'destructive'
            : status === 'paused'   ? 'warning'
            :                         'muted'
          } />
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manage billing on web"
        onPress={() => { void handleManage(); }}
        style={({ pressed }) => [
          styles.manage,
          { borderColor: c.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <ExternalLink size={iconSize.sm} color={c.mutedForeground} />
        <Text variant="label" color={c.foreground} style={{ flex: 1 }}>
          {tier === 'free' ? 'View plans' : 'Manage billing'}
        </Text>
        <Text variant="caption" color={c.mutedForeground}>
          Opens web
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  foundingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  manage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
});
