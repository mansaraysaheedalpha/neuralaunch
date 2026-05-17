// src/app/roadmap/[id]/validation.tsx
//
// Task-scoped Validation Tool. Reached from a TaskCard's "Validation"
// button when the active task suggests the validation tool. Two-phase
// surface:
//
//   1. On mount, GET /api/discovery/roadmaps/[id]/tasks/[taskId]/validation-page
//      to see whether a draft / published page already exists for
//      this task. If yes, route the founder straight to the existing
//      detail screen — no point asking them to re-describe the same
//      target.
//
//   2. Otherwise, render a target-textarea form and POST the same
//      endpoint. On success, route to /validation/[pageId] where the
//      detail screen handles preview / publish / share / report.
//
// This is the simplest task-scoped tool on mobile (no streaming, no
// multi-stage state machine, no canvas). The form layout mirrors
// /tools/validation but uses the task-scoped endpoint and includes
// the "already exists" early-return.

import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FlaskConical, ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Button, TextInput, ScreenContainer } from '@/components/ui';
import { spacing, iconSize, radius } from '@/constants/theme';

const MAX_TARGET_LEN = 2000;

interface ExistingPageResponse {
  page: { id: string; slug: string; status: string } | null;
  taskStale: boolean;
}

interface GenerateResponse {
  pageId:        string;
  slug:          string;
  status:        string;
  alreadyExists: boolean;
}

export default function TaskScopedValidationScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId?: string }>();
  const roadmapId = typeof id === 'string' ? id : '';
  const task      = typeof taskId === 'string' ? taskId : '';

  const [hydrating,    setHydrating]    = useState(true);
  const [taskStale,    setTaskStale]    = useState(false);
  const [paramsMissing, setParamsMissing] = useState(false);
  const [target,       setTarget]       = useState('');
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Check on mount whether the task already has a generated page. If
  // it does, route the founder there — no need to make them re-describe
  // the same offer.
  useEffect(() => {
    let cancelled = false;
    // Defensive: expo-router always provides both params via this
    // route's name, but a stale link or broken deep-link could land
    // here without them. Surface an explicit error instead of letting
    // the form submit a malformed URL with empty path segments.
    if (!roadmapId || !task) {
      setParamsMissing(true);
      setHydrating(false);
      return;
    }
    void (async () => {
      try {
        const data = await api<ExistingPageResponse>(
          `/api/discovery/roadmaps/${roadmapId}/tasks/${task}/validation-page`,
        );
        if (cancelled) return;
        if (data.taskStale) {
          setTaskStale(true);
          setHydrating(false);
          return;
        }
        if (data.page) {
          router.replace(`/validation/${data.page.id}` as any);
          return;
        }
        setHydrating(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not check existing validation page');
        setHydrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [roadmapId, task, router]);

  const trimmed = target.trim();
  const canSubmit = trimmed.length > 0 && !busy && !taskStale;

  async function handleGenerate() {
    if (!canSubmit) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    try {
      const { pageId } = await api<GenerateResponse>(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${task}/validation-page`,
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

  if (hydrating) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: true, headerTitle: 'Validation Tool', headerTintColor: c.foreground, headerStyle: { backgroundColor: c.background }, headerShadowVisible: false }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (paramsMissing) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: true, headerTitle: 'Validation Tool', headerTintColor: c.foreground, headerStyle: { backgroundColor: c.background }, headerShadowVisible: false }} />
        <View style={styles.centered}>
          <Text variant="title" align="center">Missing roadmap context</Text>
          <Text variant="body" color={c.mutedForeground} align="center" style={{ marginTop: spacing[3] }}>
            We didn't get the roadmap or task identifier needed to scope this validation
            page. Open the task from the roadmap to try again, or use the standalone
            Validation Tool from the Tools tab.
          </Text>
          <Button
            title="Back to discovery"
            onPress={() => router.replace('/discovery' as any)}
            variant="primary"
            size="lg"
            fullWidth
            style={{ marginTop: spacing[6] }}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (taskStale) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: true, headerTitle: 'Validation Tool', headerTintColor: c.foreground, headerStyle: { backgroundColor: c.background }, headerShadowVisible: false }} />
        <View style={styles.centered}>
          <Text variant="title" align="center">Task not found</Text>
          <Text variant="body" color={c.mutedForeground} align="center" style={{ marginTop: spacing[3] }}>
            This task no longer exists on the roadmap — it may have been removed or
            the roadmap was regenerated. Return to the roadmap to pick the current
            equivalent.
          </Text>
          <Button
            title="Back to roadmap"
            onPress={() => router.replace(`/roadmap/${roadmapId}` as any)}
            variant="primary"
            size="lg"
            fullWidth
            style={{ marginTop: spacing[6] }}
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
            Validation Tool — task scoped
          </Text>
          <Text variant="title" align="center" style={{ marginTop: spacing[2] }}>
            What are you validating with this task?
          </Text>
          <Text variant="body" color={c.mutedForeground} align="center" style={styles.intro}>
            Describe the specific offer this task is putting in front of people — the
            page we generate will speak directly to it. Visitor responses feed back into
            your continuation brief as real market signal, not vibes.
          </Text>

          <TextInput
            label="What does this task validate?"
            value={target}
            onChangeText={setTarget}
            placeholder="e.g. 'A done-for-you pricing audit for B2B SaaS founders who suspect they're under-charging.'"
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
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
  },
});
