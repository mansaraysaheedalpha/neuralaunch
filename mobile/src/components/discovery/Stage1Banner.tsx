// src/components/discovery/Stage1Banner.tsx
//
// Mobile counterpart to client/src/app/(app)/discovery/no-idea/[sessionId]/Stage1Banner.tsx.
// Dismissable Stage 1 introduction banner shown before the first
// founder message and force-visible when the message list is empty.
//
// Dismissal persists across screen mounts (and app restarts) via
// expo-secure-store, keyed by sessionId — matches the web's
// localStorage behaviour. expo-secure-store keys are restricted to
// [A-Za-z0-9_-], so the sessionId is sanitised before keying.

import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import { getPref, setPref } from '@/lib/preferences';
import { spacing, iconSize, radius } from '@/constants/theme';

interface Stage1BannerProps {
  /** The Stage 1 session ID — used to scope the dismissal so a
   *  dismissal in session A doesn't hide the banner in session B. */
  sessionId: string;
  /** True when the chat has no prior messages yet — banner is always
   *  shown, the dismiss button stays hidden so the founder reads the
   *  intro before sending their first turn. */
  forceVisible: boolean;
}

function bannerKey(sessionId: string): string {
  // expo-secure-store only accepts [A-Za-z0-9_-]; replace anything
  // else with an underscore so arbitrary sessionId shapes still key
  // safely. Prefix namespaces the key to avoid collisions with other
  // preferences in the future.
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `nl_no_idea_stage1_banner_${safe}`;
}

export function Stage1Banner({ sessionId, forceVisible }: Stage1BannerProps) {
  const { colors: c } = useTheme();
  // null = hydrating from storage (don't flash either state),
  // false = visible, true = dismissed.
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

  // Hydrating from secure-store — render nothing rather than flash
  // the banner. Matches the web's SSR-safe initial-null pattern.
  if (dismissed === null) return null;
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
