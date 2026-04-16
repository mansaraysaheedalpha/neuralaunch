// src/app/(tabs)/index.tsx
//
// The Roadmap tab (default). Shows the founder's most-recent active
// roadmap. If they have no roadmap yet, directs them to the Sessions
// tab to start their first discovery. If they have multiple roadmaps,
// we show the most recently updated one here; the Sessions tab is the
// place to switch between them.

import { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { Map } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import {
  Text,
  ScreenContainer,
  ListSkeleton,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { RoadmapViewer } from '@/components/roadmap/RoadmapViewer';
import { spacing } from '@/constants/theme';

interface RoadmapSummary {
  id:                 string;
  recommendationId:   string;
  status:             string;
  updatedAt?:         string;
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

  // Active = anything except FAILED. Pick the most recent.
  const active = roadmaps
    ?.filter(r => r.status !== 'FAILED')
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
    ?? null;

  if (error && !roadmaps) {
    const kind = error instanceof ApiError && error.status === 401 ? 'auth'
      : error instanceof ApiError && error.status === 0 ? 'network'
      : 'generic';
    return (
      <ScreenContainer>
        <ErrorState kind={kind} onRetry={() => void mutate()} />
      </ScreenContainer>
    );
  }

  if (isLoading && !roadmaps) {
    return (
      <ScreenContainer>
        <View style={{ marginTop: spacing[6] }}>
          <ListSkeleton count={4} />
        </View>
      </ScreenContainer>
    );
  }

  if (!active) {
    return (
      <ScreenContainer scroll={false}>
        <EmptyState
          icon={Map}
          title="No roadmap yet"
          message="Your roadmap is built from the discovery interview. Start a session to get your first recommendation and execution plan."
          actionLabel="Start a discovery"
          onAction={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/sessions' as any);
          }}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={onRefresh}>
      {/* Tab-context header — the roadmap viewer has its own phase headers */}
      <View style={styles.header}>
        <Text variant="caption" color={c.mutedForeground}>Your active roadmap</Text>
        <Text variant="heading">Roadmap</Text>
      </View>
      <RoadmapViewer recommendationId={active.recommendationId} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
});

