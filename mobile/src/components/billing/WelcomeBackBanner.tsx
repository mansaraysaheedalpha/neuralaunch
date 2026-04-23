// src/components/billing/WelcomeBackBanner.tsx
//
// Shown above the Billing card when a free-tier user previously held
// an Execute or Compound subscription. Re-engagement surface for
// lapsed subscribers. Copy ported from the web
// (client/src/app/(app)/settings/BillingSection.tsx) so the returning
// founder reads the same phrasing on both platforms.

import { Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import { API_BASE_URL } from '@/services/api-client';
import { radius, spacing, iconSize } from '@/constants/theme';
import type { BillingOverview } from './BillingSection';

const TIER_LABEL = {
  execute:  'Execute',
  compound: 'Compound',
} as const;

interface Props {
  overview: BillingOverview | null;
}

export function WelcomeBackBanner({ overview }: Props) {
  const { colors: c } = useTheme();

  // Silent for first-time free users and for anyone currently paying —
  // this is a lapsed-subscriber surface only.
  if (
    !overview
    || overview.tier !== 'free'
    || !overview.lastPaidTier
  ) {
    return null;
  }

  const { userName, lastPaidTier, wasFoundingMember } = overview;
  const firstName = userName?.split(' ')[0];

  // Gold accent for founding members or returning Compound founders;
  // primary blue for returning Execute founders. Matches the web's
  // conditional accent pick.
  const useGoldAccent = wasFoundingMember || lastPaidTier === 'compound';
  const accentColor  = useGoldAccent ? c.secondary : c.primary;
  const accentBg     = useGoldAccent ? c.secondaryAlpha10 : c.primaryAlpha10;
  const accentBorder = useGoldAccent ? c.secondary : c.primary;

  const priorTierLabel = TIER_LABEL[lastPaidTier];
  const foundingRate = lastPaidTier === 'compound' ? '$29' : '$19';

  async function openPricing() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await WebBrowser.openBrowserAsync(`${API_BASE_URL}/#pricing`);
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: accentBg, borderColor: accentBorder },
      ]}
    >
      <Text variant="label" color={accentColor}>
        Welcome back{firstName ? `, ${firstName}` : ''}
      </Text>
      <Text variant="caption" color={c.mutedForeground} style={styles.copy}>
        You were previously on {priorTierLabel}. Your ventures,
        roadmaps, and progress are preserved. Resubscribe anytime to
        continue where you left off.
        {wasFoundingMember && (
          <>
            {' '}Your founding member rate (
            <Text variant="caption" color={c.secondary} style={{ fontWeight: '600' }}>
              {foundingRate}/month
            </Text>
            ) is preserved.
          </>
        )}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View plans"
        onPress={() => { void openPricing(); }}
        style={({ pressed }) => [
          styles.cta,
          { borderColor: c.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text variant="caption" color={c.foreground} style={{ fontWeight: '600' }}>
          View plans
        </Text>
        <ArrowRight size={iconSize.xs} color={c.foreground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    gap: spacing[2],
  },
  copy: {
    lineHeight: 18,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[2],
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
    borderRadius: radius.md,
    marginTop: spacing[1],
  },
});
