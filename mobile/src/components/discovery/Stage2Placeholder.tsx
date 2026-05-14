// src/components/discovery/Stage2Placeholder.tsx
//
// Shown when the founder's active IdeationStageRun is Stage 2 (the
// Outcome Requirements stage). Stage 2 ships on the web but the
// mobile UX is in progress — this surface is the honest bridge:
// acknowledges the work exists on web, deep-links the founder there
// so they can keep moving, and offers a graceful exit back to
// /discovery if they'd rather wait.
//
// When the real mobile Stage 2 chat surface lands, this component is
// retired (the dispatcher will route Stage 2 directly to the chat).
// The route path /discovery/no-idea/[sessionId] stays the same so
// nothing in the rest of the navigation graph needs to change.

import { View, StyleSheet, Linking } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Sparkles, ExternalLink } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button, Card, ScreenContainer } from '@/components/ui';
import { spacing, iconSize } from '@/constants/theme';

interface Props {
  /** The DiscoverySession ID — used to build the deep-link to the
   *  web's matching Stage 2 surface so the founder picks up the same
   *  session without re-authenticating into a fresh one. */
  sessionId: string;
}

export function Stage2Placeholder({ sessionId }: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();

  const apiUrl = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? '';
  const webUrl = apiUrl ? `${apiUrl}/discovery/no-idea/${sessionId}` : null;

  async function openOnWeb() {
    if (!webUrl) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { await Linking.openURL(webUrl); } catch { /* best-effort */ }
  }

  return (
    <ScreenContainer>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Stage 2',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <View style={styles.heroIconWrap}>
        <View style={[styles.heroIcon, { backgroundColor: c.primaryAlpha10 }]}>
          <Sparkles size={iconSize.lg} color={c.primary} />
        </View>
      </View>

      <Text variant="overline" color={c.mutedForeground} align="center">
        Stage 2 of 5 — Outcome Requirements
      </Text>
      <Text variant="title" align="center" style={{ marginTop: spacing[2] }}>
        Continue Stage 2 on the web
      </Text>
      <Text
        variant="body"
        color={c.mutedForeground}
        align="center"
        style={styles.subtitle}
      >
        Stage 2 is live on the web — you'll work out what skills, constraints, and
        teammates the venture you committed to actually demands. The mobile experience
        for Stage 2 is in active development. Your session is saved; pick it up on the
        web and we'll keep porting the mobile UX in the background.
      </Text>

      <Card style={styles.sessionCard}>
        <Text variant="overline" color={c.mutedForeground}>Session ID</Text>
        <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[1] }}>
          {sessionId}
        </Text>
      </Card>

      <View style={styles.cta}>
        <Button
          title="Open on the web"
          onPress={() => { void openOnWeb(); }}
          variant="primary"
          size="lg"
          disabled={!webUrl}
          fullWidth
          icon={<ExternalLink size={iconSize.sm} color={c.primaryForeground} />}
        />
        <Button
          title="Back to discovery"
          onPress={() => router.replace('/discovery' as any)}
          variant="ghost"
          size="lg"
          fullWidth
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heroIconWrap: {
    alignItems: 'center',
    marginTop: spacing[8],
    marginBottom: spacing[4],
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: spacing[3],
    paddingHorizontal: spacing[2],
  },
  sessionCard: {
    marginTop: spacing[6],
  },
  cta: {
    marginTop: spacing[8],
    gap: spacing[2],
  },
});
