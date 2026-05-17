// src/app/tools/validation.tsx
//
// Standalone Validation Tool — mobile counterpart to the web's
// /tools/validation surface. The founder enters a target offer
// (free text), the server synthesizes a draft validation landing
// page, and we route to the existing detail screen so they can
// preview / publish / track distribution.
//
// Unlike the other standalone tools (coach / outreach / research /
// packager) this surface does NOT require an active roadmap — the
// validation tool's standalone shape was specifically designed so
// founders can test an offer without committing to a discovery
// session first. So we bypass StandaloneToolLauncher (which gates
// on roadmap context) and own the form + POST directly.

import { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FlaskConical, ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/services/auth';
import { api } from '@/services/api-client';
import { Text, Button, TextInput, ScreenContainer } from '@/components/ui';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';
import { spacing, iconSize, radius } from '@/constants/theme';

const MAX_TARGET_LEN = 2000;

export default function StandaloneValidationToolScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();
  // Tier-gate locally so a Free founder doesn't fill in the form just to
  // hit a 403 on submit. The server still enforces; this is the UX
  // layer the TaskCard already applies to the other paid tools.
  const tier = useAuth(s => s.user?.tier ?? 'free');
  const isFreeTier = tier === 'free';
  const [target, setTarget]   = useState('');
  const [busy,   setBusy]     = useState(false);
  const [error,  setError]    = useState<string | null>(null);

  const trimmed = target.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  async function handleGenerate() {
    if (!canSubmit) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    try {
      const { pageId } = await api<{ pageId: string; slug: string; status: string }>(
        '/api/tools/validation/generate',
        { method: 'POST', body: { target: trimmed } },
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/validation/${pageId}` as any);
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : 'Could not generate validation page');
      setBusy(false);
    }
  }

  if (isFreeTier) {
    return (
      <ScreenContainer>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Validation Tool',
            headerTintColor: c.foreground,
            headerStyle: { backgroundColor: c.background },
            headerShadowVisible: false,
          }}
        />
        <View style={styles.upgradeWrap}>
          <UpgradePrompt
            requiredTier="execute"
            variant="hero"
            heading="Validate before you build"
            description="Validation pages are an Execute-tier feature. Upgrade to generate a focused landing page for any offer, gather real-world demand signal, and ship a build brief grounded in visitor behaviour."
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: c.background }]}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Validation Tool',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <ScreenContainer scroll={false}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroIconWrap}>
            <View style={[styles.heroIcon, { backgroundColor: c.primaryAlpha10 }]}>
              <FlaskConical size={iconSize.lg} color={c.primary} />
            </View>
          </View>

          <Text variant="overline" color={c.mutedForeground} align="center">
            Validation Tool
          </Text>
          <Text variant="title" align="center" style={{ marginTop: spacing[2] }}>
            Test an offer before you build it
          </Text>
          <Text variant="body" color={c.mutedForeground} align="center" style={styles.intro}>
            Describe what you want to validate — who it's for, what it does, what they'd
            pay. We'll generate a focused landing page with a survey hook so you can
            measure real interest in 48 hours. No roadmap required for this one.
          </Text>

          <View style={styles.form}>
            <TextInput
              label="What are you validating?"
              value={target}
              onChangeText={setTarget}
              placeholder={
                "e.g. 'A 30-min weekly accountability call for solo consultants " +
                "who hit £100k revenue and want to scale to £250k without hiring.'"
              }
              multiline
              numberOfLines={6}
              maxLength={MAX_TARGET_LEN}
              editable={!busy}
              style={styles.targetInput}
            />
            <View style={styles.charCount}>
              <Text variant="caption" color={c.mutedForeground}>
                {trimmed.length}/{MAX_TARGET_LEN}
              </Text>
            </View>
          </View>

          {error && (
            <View style={[styles.errorBanner, { borderColor: c.destructive, backgroundColor: c.destructiveMuted }]}>
              <Text variant="caption" color={c.destructive}>
                {error}
              </Text>
            </View>
          )}

          <View style={styles.cta}>
            <Button
              title={busy ? 'Generating…' : 'Generate validation page'}
              onPress={() => { void handleGenerate(); }}
              disabled={!canSubmit}
              loading={busy}
              variant="primary"
              size="lg"
              fullWidth
              icon={<ArrowRight size={iconSize.sm} color={c.primaryForeground} />}
            />
            <Text variant="caption" color={c.mutedForeground} align="center" style={styles.subhint}>
              Saved as a draft. Preview before publishing — nothing goes public until you
              hit the publish button on the next screen.
            </Text>
          </View>
        </ScrollView>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    paddingBottom: spacing[8],
  },
  upgradeWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing[6],
  },
  heroIconWrap: {
    alignItems: 'center',
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: {
    marginTop: spacing[3],
    paddingHorizontal: spacing[2],
    marginBottom: spacing[6],
  },
  form: {
    marginTop: spacing[2],
  },
  targetInput: {
    minHeight: 140,
    textAlignVertical: 'top',
  },
  charCount: {
    alignItems: 'flex-end',
    marginTop: spacing[1],
  },
  errorBanner: {
    marginTop: spacing[4],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  cta: {
    marginTop: spacing[6],
    gap: spacing[3],
  },
  subhint: {
    paddingHorizontal: spacing[2],
  },
});
