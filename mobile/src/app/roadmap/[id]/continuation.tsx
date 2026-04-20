// src/app/roadmap/[id]/continuation.tsx
//
// Continuation screen — shown when a founder nears the end of their
// roadmap. Presents a closing reflection, 2-3 alternative forks for
// what to do next, and the parking lot of deferred ideas.
// Selecting a fork creates a new Recommendation and starts a new cycle.

import { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useContinuation, type ContinuationFork } from '@/hooks/useContinuation';
import { api, ApiError } from '@/services/api-client';
import { Text, Card, Button, Badge, ScreenContainer, Separator } from '@/components/ui';
import { spacing } from '@/constants/theme';

export default function ContinuationScreen() {
  const { id: roadmapId } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useTheme();
  const router = useRouter();
  const { data, isLoading, isGenerating } = useContinuation(roadmapId ?? null);

  const [selectedFork, setSelectedFork] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleForkSelection(fork: ContinuationFork) {
    if (!roadmapId || forking) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedFork(fork.id);
    setForking(true);
    setError(null);

    try {
      const result = await api<{ recommendationId: string }>(
        `/api/discovery/roadmaps/${roadmapId}/continuation/fork`,
        {
          method: 'POST',
          body: { forkId: fork.id },
        },
      );

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/recommendation/${result.recommendationId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not continue. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSelectedFork(null);
    } finally {
      setForking(false);
    }
  }

  // Loading / generating
  if (isLoading || isGenerating || !data) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: "What's next",
            headerTintColor: c.foreground,
            headerStyle: { backgroundColor: c.background },
            headerShadowVisible: false,
          }}
        />
        <View style={[styles.centered, { backgroundColor: c.background }]}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
            {isGenerating ? 'Reviewing your journey…' : 'Loading…'}
          </Text>
          {isGenerating && (
            <Text variant="caption" color={c.mutedForeground} align="center" style={{ marginTop: spacing[1], paddingHorizontal: spacing[8] }}>
              Looking at what you've completed, what you've learned,
              and what the next step could be. Takes about 30 seconds.
            </Text>
          )}
        </View>
      </>
    );
  }

  // Blocked state — can't continue yet
  if (!data.canContinue) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: "What's next",
            headerTintColor: c.foreground,
            headerStyle: { backgroundColor: c.background },
            headerShadowVisible: false,
          }}
        />
        <ScreenContainer>
          <Card variant="muted">
            <Text variant="label">Not yet</Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
              {data.blockReason ?? 'Complete more of your roadmap before generating the next step.'}
            </Text>
          </Card>
        </ScreenContainer>
      </>
    );
  }

  const brief = data.brief;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "What's next",
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <ScreenContainer>
        {/* Forks — the decision moment. Placed above the closing reflection
            on mobile so the actionable content is immediately visible. */}
        {brief && brief.forks.length > 0 && (
          <View>
            <Text variant="overline" color={c.secondary} style={styles.decisionOverline}>
              The decision
            </Text>
            <Text variant="title">What could come next</Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1], marginBottom: spacing[4] }}>
              Three paths forward based on what you've learned. Pick the
              one that fits — it'll become your next recommendation.
            </Text>

            <View style={styles.forkList}>
              {brief.forks.map((fork) => {
                const isSelected = selectedFork === fork.id;
                const isDimmed = selectedFork !== null && !isSelected;
                return (
                  <Pressable
                    key={fork.id}
                    onPress={() => handleForkSelection(fork)}
                    disabled={forking}
                    style={isDimmed ? styles.forkDimmed : undefined}
                  >
                    <Card
                      noPadding
                      style={[
                        styles.forkCard,
                        {
                          backgroundColor: isSelected ? c.secondaryAlpha10 : c.card,
                          borderColor: isSelected ? c.secondary : c.border,
                          borderWidth: isSelected ? 2 : 1,
                        },
                      ]}
                    >
                      <Text variant="label" color={isSelected ? c.secondary : c.foreground}>
                        {fork.title}
                      </Text>
                      <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                        {fork.summary}
                      </Text>

                      <View style={[styles.whySection, { borderTopColor: c.border }]}>
                        <Text variant="overline" color={c.mutedForeground}>
                          Why this one
                        </Text>
                        <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[1] }}>
                          {fork.whyThisOne}
                        </Text>
                      </View>

                      {forking && isSelected && (
                        <View style={styles.forkLoading}>
                          <ActivityIndicator size="small" color={c.secondary} />
                          <Text variant="caption" color={c.secondary} style={{ marginLeft: spacing[2] }}>
                            Building your next recommendation…
                          </Text>
                        </View>
                      )}
                    </Card>
                  </Pressable>
                );
              })}
            </View>

            {error && (
              <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[3] }}>
                {error}
              </Text>
            )}
          </View>
        )}

        {/* Closing reflection — retrospective context, placed below the
            forks so the actionable decision leads. */}
        {brief?.closingReflection && (
          <Card variant="primary" style={styles.reflectionCard}>
            <Text variant="overline" color={c.primary}>
              How far you've come
            </Text>
            <Text variant="body" style={{ marginTop: spacing[2] }}>
              {brief.closingReflection}
            </Text>
          </Card>
        )}

        {/* Parking lot */}
        {brief?.parkingLot && brief.parkingLot.length > 0 && (
          <>
            <Separator />
            <View style={styles.section}>
              <Text variant="title">Your parking lot</Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1], marginBottom: spacing[3] }}>
                Ideas you captured along the way but deferred. Save these
                for future discovery sessions.
              </Text>

              <View style={styles.parkingList}>
                {brief.parkingLot.map((entry) => (
                  <Card key={entry.id}>
                    <View style={styles.parkingHeader}>
                      <Badge label={entry.source} variant="muted" />
                      <Text variant="caption" color={c.mutedForeground}>
                        {new Date(entry.capturedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text variant="body" style={{ marginTop: spacing[2] }}>
                      {entry.idea}
                    </Text>
                  </Card>
                ))}
              </View>
            </View>
          </>
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: spacing[4],
  },
  decisionOverline: {
    marginBottom: spacing[1],
    letterSpacing: 1,
  },
  forkList: {
    gap: spacing[3],
  },
  forkCard: {
    gap: spacing[1],
    padding: spacing[5],
  },
  forkDimmed: {
    opacity: 0.45,
  },
  whySection: {
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
  },
  forkLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing[3],
  },
  reflectionCard: {
    marginTop: spacing[6],
  },
  parkingList: {
    gap: spacing[2],
  },
  parkingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
