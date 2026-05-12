// src/app/discovery/no-idea/mindset.tsx
//
// Mobile counterpart to client/src/app/(app)/discovery/no-idea/mindset/page.tsx
// (Stage 0 — Mindset). Fully static screen with no LLM/streaming.
// The "I'm ready, let's start" CTA hits POST /api/discovery/no-idea/start
// — the REST mirror of the web's startNoIdeaSession server action —
// and routes to /discovery/no-idea/[sessionId] (Stage 1) on success.

import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Button, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';

export default function NoIdeaMindsetScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleStart() {
    if (pending) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPending(true);
    setError(null);
    try {
      const { sessionId } = await api<{ sessionId: string }>(
        '/api/discovery/no-idea/start',
        { method: 'POST', body: {} },
      );
      router.replace(`/discovery/no-idea/${sessionId}` as any);
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err instanceof Error ? err.message : 'Could not start the session. Please try again.');
      setPending(false);
    }
  }

  return (
    <ScreenContainer>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: '',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <Text variant="overline" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
        Stage 0 of 5 — Mindset
      </Text>

      <View style={styles.section}>
        <Text variant="title">What you're about to do</Text>
        <Text variant="body" color={c.mutedForeground} style={styles.prose}>
          You've said you want to start a business but you don't have an idea yet. Over the
          next five stages, we work that out together — not by handing you a generic
          playbook, but by figuring out what outcome would actually fit your life, what
          you're built to execute, where the real pain points are in the world, which of
          those you can credibly go after, and how to validate the most promising one. By
          the end you'll have one validated idea and a roadmap to start moving on it.
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="title">What this requires</Text>
        <View style={{ gap: spacing[3], marginTop: spacing[3] }}>
          <RequirementRow
            heading="Diligence."
            body="There's homework. The agent will ask you to do real things in the real world — talk to people, observe your own life, write things down. Skipping those steps produces a hollow result."
            colors={c}
          />
          <RequirementRow
            heading="Perseverance."
            body="The first idea you commit to may not survive validation. That's the system working, not breaking. Coming back to pick the next one is part of the process."
            colors={c}
          />
          <RequirementRow
            heading="Honesty."
            body="You can mislead the agent — exaggerate your skills, ignore the trade-offs, pick a goal that doesn't fit your life — but you'll be building on top of the lies. Everything downstream gets worse."
            colors={c}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text variant="title">What you'll have at the end</Text>
        <Text variant="body" color={c.mutedForeground} style={styles.prose}>
          A ranked shortlist of five evaluated opportunities, one chosen and committed to, a
          validation roadmap for it, and a clear path forward whether validation passes or
          fails. This is not a generator that hands you an idea — it's a process that helps
          you arrive at one you can stand behind.
        </Text>
      </View>

      {error && (
        <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[2] }}>
          {error}
        </Text>
      )}

      <View style={styles.cta}>
        <Button
          title={pending ? 'Starting…' : "I'm ready, let's start"}
          onPress={() => { void handleStart(); }}
          variant="primary"
          size="lg"
          loading={pending}
          fullWidth
        />
        <Button
          title="Not yet"
          onPress={() => router.back()}
          variant="ghost"
          size="lg"
          disabled={pending}
          fullWidth
        />
      </View>
    </ScreenContainer>
  );
}

function RequirementRow({
  heading,
  body,
  colors: c,
}: {
  heading: string;
  body: string;
  colors: Record<string, string>;
}) {
  return (
    <View>
      <Text variant="label">{heading}</Text>
      <Text variant="body" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing[6],
  },
  prose: {
    marginTop: spacing[2],
  },
  cta: {
    marginTop: spacing[8],
    marginBottom: spacing[6],
    gap: spacing[2],
  },
});
