// src/components/discovery/stage2/Stage2Banner.tsx
//
// Mobile counterpart to
// client/src/app/(app)/discovery/no-idea/[sessionId]/Stage2Banner.tsx.
// Dismissable Stage 2 intro card. Force-visible when there are no
// prior chat messages so the founder reads the framing before their
// first turn; dismissable thereafter with persistence via
// expo-secure-store (same pattern as Stage1Banner).

import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import { getPref, setPref } from '@/lib/preferences';
import { spacing, iconSize, radius } from '@/constants/theme';

interface Stage2BannerProps {
  sessionId:    string;
  forceVisible: boolean;
}

function bannerKey(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `nl_no_idea_stage2_banner_${safe}`;
}

export function Stage2Banner({ sessionId, forceVisible }: Stage2BannerProps) {
  const { colors: c } = useTheme();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getPref(bannerKey(sessionId));
      if (!cancelled) setDismissed(stored === '1');
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  function dismiss() {
    setDismissed(true);
    void setPref(bannerKey(sessionId), '1');
  }

  if (dismissed === null) return null;
  if (dismissed && !forceVisible) return null;

  return (
    <View style={[styles.banner, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={{ flex: 1 }}>
        <Text variant="overline" color={c.foreground}>
          Stage 2 of 5 — Outcome Requirements
        </Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
          Stage 1 told us what outcome you're aiming for. Stage 2 figures out what skills
          and constraints that outcome actually demands — and where you sit against them.
          Calibrate your tiers below (drag the pill or tap a tier), or talk it through in
          the chat. When you're ready, derive your Expected Profile and we'll show you
          the gaps that matter.
        </Text>
      </View>
      {!forceVisible && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss Stage 2 intro"
          onPress={dismiss}
          hitSlop={8}
          style={({ pressed }) => [styles.dismiss, pressed && { opacity: 0.6 }]}
        >
          <X size={iconSize.sm} color={c.mutedForeground} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing[3],
  },
  dismiss: {
    padding: spacing[1],
  },
});
