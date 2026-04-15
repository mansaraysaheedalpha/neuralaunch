// src/components/roadmap/RoadmapViewer.tsx
//
// The interactive roadmap content — progress header, phase blocks
// with their task cards, stale banner, closing thought, continuation
// link. Shared between `/roadmap/[id]` (deep link / push) and
// `/(tabs)/index` (the Roadmap tab — active roadmap by default).
//
// Takes `recommendationId` as a prop; owns its own data fetching via
// useRoadmap. Loading / generating / error states render inline so
// both call sites look identical.

import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useRoadmap } from '@/hooks/useRoadmap';
import {
  Text,
  Card,
  Button,
  ListSkeleton,
  ErrorState,
} from '@/components/ui';
import { ProgressHeader } from './ProgressHeader';
import { PhaseBlock } from './PhaseBlock';
import { spacing } from '@/constants/theme';

interface Props {
  recommendationId: string | null;
}

export function RoadmapViewer({ recommendationId }: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const { roadmap, isLoading, isGenerating, refresh } = useRoadmap(recommendationId);

  if (isGenerating) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
          Building your execution roadmap…
        </Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
          This takes about 20–30 seconds
        </Text>
      </View>
    );
  }

  if (isLoading || !roadmap) {
    return (
      <View style={{ marginTop: spacing[6] }}>
        <ListSkeleton count={4} />
      </View>
    );
  }

  if (roadmap.status === 'FAILED') {
    return (
      <ErrorState
        title="Roadmap generation failed"
        message="Your roadmap could not be generated. Please try again."
        onRetry={() => void refresh()}
      />
    );
  }

  return (
    <>
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

      {/* Closing thought — gold accent, this is a high-value moment */}
      {roadmap.closingThought && (
        <Card variant="primary" style={styles.closingCard}>
          <Text variant="overline" color={c.secondary}>
            Your Next Move
          </Text>
          <Text variant="body" style={{ marginTop: spacing[2] }}>
            {roadmap.closingThought}
          </Text>
        </Card>
      )}

      {/* Continuation — visible once some tasks are done */}
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
