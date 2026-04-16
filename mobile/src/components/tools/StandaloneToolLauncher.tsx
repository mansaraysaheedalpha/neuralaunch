// src/components/tools/StandaloneToolLauncher.tsx
//
// Shared entry point for the three standalone tool routes
// (/tools/coach, /tools/outreach, /tools/research). The task-level
// tool screens at /roadmap/[id]/{coach,outreach,research} already
// handle the no-taskId case, so "standalone" is really just routing
// those screens without a taskId.
//
// Each wrapper screen uses this component to:
//   1. Fetch the user's roadmaps (SWR)
//   2. Identify the most recent active one
//   3. router.replace to /roadmap/<id>/<tool>
//   4. If no roadmap exists, show an EmptyState pointing at Sessions.

import { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import useSWR from 'swr';
import { Map } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, ScreenContainer, EmptyState } from '@/components/ui';
import { spacing } from '@/constants/theme';

interface RoadmapSummary {
  id:               string;
  recommendationId: string;
  status:           string;
  updatedAt?:       string;
}

interface Props {
  tool:  'coach' | 'outreach' | 'research';
  label: string;
}

export function StandaloneToolLauncher({ tool, label }: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();

  const { data: roadmaps, isLoading } = useSWR<RoadmapSummary[]>(
    '/api/discovery/roadmaps',
    (url: string) => api<RoadmapSummary[]>(url),
  );

  const active = roadmaps
    ?.filter(r => r.status !== 'FAILED')
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
    ?? null;

  useEffect(() => {
    if (!isLoading && active) {
      // Replace — if the user backs out, they go to the prior screen,
      // not this intermediate launcher.
      router.replace(`/roadmap/${active.recommendationId}/${tool}` as any);
    }
  }, [isLoading, active, tool, router]);

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.primary} />
          <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
            Opening {label}…
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!active) {
    return (
      <ScreenContainer scroll={false}>
        <EmptyState
          icon={Map}
          title={`${label} needs a roadmap`}
          message="Tools work against the context in your roadmap. Start a discovery session first — once you have a recommendation and roadmap, you can use any tool here."
          actionLabel="Go to Sessions"
          onAction={() => router.replace('/(tabs)/sessions' as any)}
        />
      </ScreenContainer>
    );
  }

  // Redirecting — show a brief loader; the useEffect above replaces
  // the route almost immediately after render.
  return (
    <ScreenContainer>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing[10],
  },
});
