// src/app/(tabs)/roadmap.tsx
//
// Roadmap tab — shows the most recent active roadmap with a quick
// progress summary and links to the full interactive roadmap view.
// If no active roadmap exists, shows guidance to start one.

import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Card, Badge, Button, ScreenContainer, Separator } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

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

  const { data: roadmaps, isLoading } = useSWR<RoadmapSummary[]>(
    '/api/discovery/roadmaps',
    (url: string) => api<RoadmapSummary[]>(url),
    { revalidateOnFocus: true },
  );

  function handleRoadmapPress(r: RoadmapSummary) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/roadmap/${r.recommendationId}`);
  }

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <Text variant="heading">Your Roadmap</Text>
        <Text variant="caption" color={c.mutedForeground}>
          Track progress and check in on each step
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : !roadmaps || roadmaps.length === 0 ? (
        <View style={styles.empty}>
          <Card>
            <Text variant="body" color={c.mutedForeground}>
              Accept a recommendation to generate your execution roadmap.
              Each task will appear here with check-in support.
            </Text>
            <Button
              title="Start Discovery"
              onPress={() => router.push('/discovery')}
              variant="secondary"
              size="sm"
              style={{ marginTop: spacing[3] }}
            />
          </Card>
        </View>
      ) : (
        <FlatList
          data={roadmaps}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const progress = item.progress;
            const percentage = progress && progress.totalTasks > 0
              ? Math.round((progress.completedTasks / progress.totalTasks) * 100)
              : 0;

            return (
              <Pressable onPress={() => handleRoadmapPress(item)}>
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
      )}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
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
