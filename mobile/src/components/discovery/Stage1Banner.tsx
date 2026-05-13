// src/components/discovery/Stage1Banner.tsx
//
// Mobile counterpart to client/src/app/(app)/discovery/no-idea/[sessionId]/Stage1Banner.tsx.
// Dismissable Stage 1 introduction banner shown before the first
// founder message and force-visible when the message list is empty.
//
// Dismissal state is in-memory only — it resets when the screen is
// unmounted. AsyncStorage persistence (parity with the web's
// localStorage behaviour) is queued for Phase D so we don't add a
// new dependency just for this banner. The UX cost is small: the
// banner re-appears if the founder leaves and returns mid-session,
// but a single Pressable click dismisses it again.

import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import { spacing, iconSize, radius } from '@/constants/theme';

interface Stage1BannerProps {
  /** True when the chat has no prior messages yet — banner is always
   *  shown, the dismiss button stays hidden so the founder reads the
   *  intro before sending their first turn. */
  forceVisible: boolean;
}

export function Stage1Banner({ forceVisible }: Stage1BannerProps) {
  const { colors: c } = useTheme();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed && !forceVisible) return null;

  return (
    <View style={[styles.banner, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={{ flex: 1 }}>
        <Text variant="overline" color={c.foreground}>
          Stage 1 of 5 — Outcome Definition
        </Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
          Before we look for ideas, we need to know what outcome would actually fit your
          life. I'll ask you about four things: how soon you want results, what you want to
          earn, how much risk you can tolerate, and what kind of operation you actually want
          to be running. At the end you'll see an Outcome Document — a short plain-language
          picture of what you're aiming for — that you can sit with, edit, or push back on
          before we move on.
        </Text>
      </View>
      {!forceVisible && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss Stage 1 intro"
          onPress={() => setDismissed(true)}
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
