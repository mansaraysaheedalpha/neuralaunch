// src/components/billing/UpgradePrompt.tsx
//
// Mobile counterpart to the web UpgradePrompt (client/src/components/
// billing/UpgradePrompt.tsx). Two shapes:
//
//   - compact: one-line gold-bordered banner that replaces a gated
//     tool row on task cards.
//   - hero:    dominant gold-bordered block used on empty tool screens
//     or the recommendation page when the whole surface is gated.
//
// Tapping either opens the web pricing page in `expo-web-browser`
// (in-app browser), so the founder never leaves the app. Once a
// native / Paddle-portal checkout flow lands this component becomes
// the single switch-point — the CTA handler changes, nothing else.

import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Sparkles, ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import { API_BASE_URL } from '@/services/api-client';
import { radius, spacing, iconSize } from '@/constants/theme';

type RequiredTier = 'execute' | 'compound';
type Variant      = 'compact' | 'hero';

interface Props {
  /** Which tier the gated feature requires. Shapes the default copy. */
  requiredTier?: RequiredTier;
  /** compact = inline banner; hero = dominant CTA block. */
  variant?:      Variant;
  /** Override the headline copy. */
  heading?:      string;
  /** Override the description copy (hero variant only). */
  description?:  string;
  /** Override the primary button label. */
  primaryLabel?: string;
  /** Custom tap handler — defaults to opening the web pricing page. */
  onPress?:      () => void;
  style?:        ViewStyle;
}

const DEFAULT_COPY = {
  execute: {
    compactHeading:  'Upgrade to Execute to unlock execution tools.',
    heroHeading:     'Ready to execute?',
    heroDescription: 'Upgrade to Execute to turn this recommendation into a roadmap with Coach, Composer, Research, and Packager unlocked on every task.',
    primaryLabel:    'Upgrade to Execute',
  },
  compound: {
    compactHeading:  'Upgrade to Compound to unlock this feature.',
    heroHeading:     'Ready to compound?',
    heroDescription: 'Upgrade to Compound for cross-session memory, voice mode, validation landing pages, and up to three concurrent ventures.',
    primaryLabel:    'Upgrade to Compound',
  },
} as const;

export function UpgradePrompt({
  requiredTier = 'execute',
  variant      = 'compact',
  heading,
  description,
  primaryLabel,
  onPress,
  style,
}: Props) {
  const { colors: c } = useTheme();
  const copy = DEFAULT_COPY[requiredTier];

  function handlePress() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) return onPress();
    // Pricing anchor on the web landing page; opens in the in-app
    // browser so the founder can authenticate via the same session if
    // they proceed to checkout. When native checkout lands, swap this
    // for the native flow.
    void WebBrowser.openBrowserAsync(`${API_BASE_URL}/#pricing`);
  }

  if (variant === 'compact') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primaryLabel ?? copy.primaryLabel}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.compact,
          {
            backgroundColor: c.secondaryAlpha10,
            borderColor: c.secondaryAlpha20,
            opacity: pressed ? 0.85 : 1,
          },
          style,
        ]}
      >
        <Sparkles size={iconSize.xs} color={c.secondary} />
        <Text variant="caption" color={c.secondary} style={styles.compactHeading}>
          {heading ?? copy.compactHeading}
        </Text>
        <ArrowRight size={iconSize.xs} color={c.secondary} />
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: c.secondaryAlpha10, borderColor: c.secondary },
        style,
      ]}
    >
      <View style={styles.heroHeader}>
        <Sparkles size={iconSize.md} color={c.secondary} />
        <Text variant="overline" color={c.secondary} style={styles.heroOverline}>
          {requiredTier === 'compound' ? 'Compound tier' : 'Execute tier'}
        </Text>
      </View>
      <Text variant="title" style={{ marginTop: spacing[2] }}>
        {heading ?? copy.heroHeading}
      </Text>
      <Text
        variant="body"
        color={c.foreground}
        style={{ marginTop: spacing[2], opacity: 0.85 }}
      >
        {description ?? copy.heroDescription}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primaryLabel ?? copy.primaryLabel}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.heroCta,
          { backgroundColor: c.primary, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <ArrowRight size={iconSize.sm} color={c.primaryForeground} />
        <Text variant="label" color={c.primaryForeground}>
          {primaryLabel ?? copy.primaryLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  compactHeading: {
    flex: 1,
  },
  hero: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing[5],
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  heroOverline: {
    letterSpacing: 1,
  },
  heroCta: {
    marginTop: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2.5],
    borderRadius: radius.lg,
  },
});
