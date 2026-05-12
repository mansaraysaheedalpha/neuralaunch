// src/app/discovery/no-idea/[sessionId].tsx
//
// Stage 1 placeholder — Phase A drops the founder here after starting
// a no_idea session from the mindset screen. The full Stage 1 chat
// (turn streaming, OutcomeDocument review, dimension editing) is the
// Phase B target; until then we surface the session ID and a "Continue
// on the web" affordance so the founder isn't stranded.
//
// When Phase B replaces this with the real chat surface, the route
// path stays identical so existing navigation links keep working.

import { View, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button, Card, ScreenContainer } from '@/components/ui';
import { spacing, iconSize } from '@/constants/theme';

export default function NoIdeaSessionScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const apiUrl = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? '';
  const webUrl = sessionId && apiUrl ? `${apiUrl}/discovery/no-idea/${sessionId}` : null;

  async function openOnWeb() {
    if (!webUrl) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Linking.openURL(webUrl);
    } catch { /* best-effort */ }
  }

  return (
    <ScreenContainer>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Stage 1 — Outcome Definition',
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

      <Text variant="title" align="center">
        Your session is ready
      </Text>
      <Text variant="body" color={c.mutedForeground} align="center" style={styles.subtitle}>
        Stage 1 — the agentic Outcome Definition chat — is in active
        development on mobile. Your session has been created and saved.
        Open it on the web to continue while we ship the mobile chat.
      </Text>

      {sessionId && (
        <Card style={styles.sessionCard}>
          <Text variant="overline" color={c.mutedForeground}>Session ID</Text>
          <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[1] }}>
            {sessionId}
          </Text>
        </Card>
      )}

      <View style={styles.cta}>
        <Button
          title="Continue on the web"
          onPress={() => { void openOnWeb(); }}
          variant="primary"
          size="lg"
          disabled={!webUrl}
          fullWidth
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
    marginBottom: spacing[6],
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
