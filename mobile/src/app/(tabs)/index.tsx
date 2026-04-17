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
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import {
  Text,
  Button,
  ScreenContainer,
  ListSkeleton,
  ErrorState,
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
    // First-run: render the discovery invitation inline instead of
    // bouncing through the Sessions tab. The voice matches the onboarding
    // carousel — this is the same moment, continued.
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.firstRun}>
          <Text variant="heading" align="center" style={styles.firstRunTitle}>
            Your first step is a conversation.
          </Text>
          <Text
            variant="body"
            color={c.mutedForeground}
            align="center"
            style={styles.firstRunCopy}
          >
            Start your discovery interview. It takes 8–12 minutes and
            produces one honest recommendation.
          </Text>
          <View style={styles.firstRunCta}>
            <Button
              title="Start your discovery"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/discovery' as any);
              }}
              size="lg"
              fullWidth
            />
          </View>
        </View>
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
  firstRun: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  firstRunTitle: {
    maxWidth: 320,
    marginBottom: spacing[3],
  },
  firstRunCopy: {
    maxWidth: 360,
    marginBottom: spacing[8],
  },
  firstRunCta: {
    width: '100%',
    maxWidth: 360,
  },
});

