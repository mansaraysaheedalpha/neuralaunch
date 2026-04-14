// src/app/roadmap/[id].tsx
//
// Roadmap view screen — interactive task cards organized by phase,
// progress header, closing thought, and stale-roadmap banner.
// The [id] param is the recommendationId (matching the web app's URL).

import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';
import { useRoadmap } from '@/hooks/useRoadmap';
import { Text, Card, Button, ScreenContainer } from '@/components/ui';
import { ProgressHeader } from '@/components/roadmap/ProgressHeader';
import { PhaseBlock } from '@/components/roadmap/PhaseBlock';
import { spacing } from '@/constants/theme';

export default function RoadmapScreen() {
  const { id: recommendationId } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useTheme();
  const router = useRouter();
  const { roadmap, isLoading, isGenerating, refresh } = useRoadmap(recommendationId ?? null);

  // Loading / generating state
  if (isLoading || isGenerating || !roadmap) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Your Roadmap',
            headerTintColor: c.foreground,
            headerStyle: { backgroundColor: c.background },
            headerShadowVisible: false,
          }}
        />
        <View style={[styles.centered, { backgroundColor: c.background }]}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
            {isGenerating
              ? 'Building your execution roadmap…'
              : 'Loading…'}
          </Text>
          {isGenerating && (
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
              This takes about 20–30 seconds
            </Text>
          )}
        </View>
      </>
    );
  }

  // Failed state
  if (roadmap.status === 'FAILED') {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Your Roadmap',
            headerTintColor: c.foreground,
            headerStyle: { backgroundColor: c.background },
            headerShadowVisible: false,
          }}
        />
        <View style={[styles.centered, { backgroundColor: c.background }]}>
          <Text variant="label" color={c.destructive}>
            Something went wrong
          </Text>
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
            Your roadmap could not be generated. Please try again.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Your Roadmap',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <ScreenContainer>
        {/* Stale banner */}
        {roadmap.status === 'STALE' && (
          <Card variant="muted" style={styles.staleBanner}>
            <Text variant="caption" color={c.warning}>
              Your recommendation was updated after this roadmap was generated.
              The content below may be outdated.
            </Text>
            <Button
              title="Regenerate roadmap"
              onPress={() => { /* TODO: wire regeneration */ }}
              variant="secondary"
              size="sm"
              style={{ marginTop: spacing[2] }}
            />
          </Card>
        )}

        {/* Progress header */}
        <ProgressHeader
          totalWeeks={roadmap.totalWeeks}
          weeklyHours={roadmap.weeklyHours}
          progress={roadmap.progress}
        />

        {/* Phases */}
        <View style={styles.phases}>
          {roadmap.phases.map((phase, i) => (
            <PhaseBlock
              key={phase.phase}
              phase={phase}
              index={i}
              roadmapId={roadmap.id}
              recommendationId={recommendationId ?? ''}
            />
          ))}
        </View>

        {/* Closing thought */}
        {roadmap.closingThought && (
          <View>
            <Card variant="primary" style={styles.closingCard}>
              <Text variant="overline" color={c.primary}>
                Your Next Move
              </Text>
              <Text variant="body" style={{ marginTop: spacing[2] }}>
                {roadmap.closingThought}
              </Text>
            </Card>
          </View>
        )}

        {/* Continuation link — visible once some tasks are done */}
        {roadmap.progress && roadmap.progress.completedTasks > 0 && (
          <View style={{ marginTop: spacing[6] }}>
            <Card variant="muted">
              <Text variant="overline" color={c.mutedForeground}>
                What's next
              </Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                Looking for the next step? Generate a continuation brief
                based on your progress so far.
              </Text>
              <Button
                title="See what's next →"
                onPress={() => router.push(`/roadmap/${recommendationId}/continuation` as any)}
                variant="ghost"
                size="sm"
                style={{ marginTop: spacing[2], alignSelf: 'flex-start' }}
              />
            </Card>
          </View>
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
    paddingHorizontal: spacing[8],
  },
  staleBanner: {
    marginBottom: spacing[4],
  },
  phases: {
    gap: spacing[10],
    marginTop: spacing[6],
  },
  closingCard: {
    marginTop: spacing[8],
  },
});
