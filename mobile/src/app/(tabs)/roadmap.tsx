// src/app/(tabs)/roadmap.tsx
//
// Roadmap tab — shows the most recent active roadmap with a quick
// progress summary and links to the full interactive roadmap view.
// If no active roadmap exists, shows guidance to start one.

import { useState, useCallback } from 'react';
import { View, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { Map, Compass } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import {
  Text,
  Card,
  Badge,
  Button,
  ScreenContainer,
  ListSkeleton,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { spacing } from '@/constants/theme';

interface RoadmapSummary {
  id:               string;
  recommendationId: string;
  status:           string;
  totalWeeks:       number | null;
  weeklyHours:      number | null;
  recommendationPath: string;
  progress: {
    totalTasks:     number;
    completedTasks: number;
    blockedTasks:   number;
    nudgePending:   boolean;
  } | null;
}

export default function RoadmapTabScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();

  const { data: roadmaps, isLoading, error, mutate } = useSWR<RoadmapSummary[]>(
    '/api/discovery/roadmaps',
    (url: string) => api<RoadmapSummary[]>(url),
    { revalidateOnFocus: true },
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    void Haptics.selectionAsync();
    setRefreshing(true);
    try { await mutate(); }
    finally { setRefreshing(false); }
  }, [mutate]);

  function handleRoadmapPress(r: RoadmapSummary) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/roadmap/${r.recommendationId}`);
  }

  const header = (
    <View style={styles.header}>
      <Text variant="heading">Your Roadmap</Text>
      <Text variant="caption" color={c.mutedForeground}>
        Track progress and check in on each step
      </Text>
    </View>
  );

  // Hard error — show full error state (only if no cached data)
  if (error && !roadmaps) {
    const kind = error instanceof ApiError && error.status === 401 ? 'auth'
      : error instanceof ApiError && error.status === 0 ? 'network'
      : 'generic';
    return (
      <ScreenContainer scroll={false}>
        {header}
        <ErrorState kind={kind} onRetry={() => void mutate()} />
      </ScreenContainer>
    );
  }

  if (isLoading && !roadmaps) {
    return (
      <ScreenContainer scroll={false}>
        {header}
        <View style={styles.listPad}>
          <ListSkeleton count={3} />
        </View>
      </ScreenContainer>
    );
  }

  if (!roadmaps || roadmaps.length === 0) {
    return (
      <ScreenContainer scroll={false}>
        {header}
        <EmptyState
          icon={Map}
          title="No roadmap yet"
          message="Accept a recommendation to generate your execution roadmap. Each task will appear here with check-in support."
          actionLabel="Start Discovery"
          onAction={() => router.push('/discovery')}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      {header}
      <FlatList
        data={roadmaps}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.primary}
            colors={[c.primary]}
          />
        }
        renderItem={({ item }) => {
          const progress = item.progress;
          const percentage = progress && progress.totalTasks > 0
            ? Math.round((progress.completedTasks / progress.totalTasks) * 100)
            : 0;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open roadmap: ${item.recommendationPath}`}
              onPress={() => handleRoadmapPress(item)}
            >
              <Card style={styles.roadmapCard}>
                <View style={styles.cardHeader}>
                  <Badge
                    label={item.status === 'READY' ? 'Active' : item.status.toLowerCase()}
                    variant={item.status === 'READY' ? 'success' : item.status === 'STALE' ? 'warning' : 'muted'}
                  />
                  {progress?.nudgePending && (
                    <Badge label="Check in" variant="warning" />
                  )}
                </View>

                <Text variant="label" numberOfLines={2} style={{ marginTop: spacing[2] }}>
                  {item.recommendationPath}
                </Text>

                {item.totalWeeks && item.weeklyHours && (
                  <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
                    {item.totalWeeks} weeks · {item.weeklyHours} hrs/week
                  </Text>
                )}

                {/* Progress bar */}
                {progress && progress.totalTasks > 0 && (
                  <View style={styles.progressSection}>
                    <View style={[styles.progressTrack, { backgroundColor: c.muted }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { backgroundColor: c.primary, width: `${percentage}%` as any },
                        ]}
                      />
                    </View>
                    <View style={styles.progressLabels}>
                      <Text variant="caption" color={c.mutedForeground}>
                        {progress.completedTasks}/{progress.totalTasks}
                      </Text>
                      {progress.blockedTasks > 0 && (
                        <Text variant="caption" color={c.destructive}>
                          {progress.blockedTasks} blocked
                        </Text>
                      )}
                      <Text variant="caption" color={c.primary}>{percentage}%</Text>
                    </View>
                  </View>
                )}
              </Card>
            </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
    gap: spacing[1],
    paddingHorizontal: spacing[5],
  },
  listPad: {
    paddingHorizontal: spacing[5],
  },
  list: {
    paddingHorizontal: spacing[5],
    gap: spacing[3],
    paddingBottom: spacing[8],
  },
  roadmapCard: {
    gap: spacing[0.5],
  },
  cardHeader: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  progressSection: {
    gap: spacing[1],
    marginTop: spacing[3],
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
