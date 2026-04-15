// src/app/(tabs)/sessions.tsx
//
// The Sessions tab — the founder's history + starting point. Consolidates:
// 1. A "Start new discovery" CTA at the top (this is how every new
//    journey begins).
// 2. Active sessions — discovery interviews the user started but
//    hasn't finished synthesising.
// 3. Recommendations — each recommendation the founder has received,
//    with its state (pending / accepted / has-roadmap / completed).
//
// Tapping a recommendation pushes to /recommendation/[id]. Tapping a
// recommendation that has a roadmap pushes to /roadmap/[id].

import { useCallback, useState } from 'react';
import { View, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { Compass, PlayCircle, Pause, CheckCircle2, ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import {
  Text,
  Card,
  Button,
  Badge,
  ScreenContainer,
  ListSkeleton,
  ErrorState,
  Separator,
} from '@/components/ui';
import { spacing, iconSize } from '@/constants/theme';

interface RecommendationSummary {
  id:                 string;
  path:               string;
  summary:            string;
  acceptedAt:         string | null;
  recommendationType: string | null;
  createdAt:          string;
}

interface IncompleteSession {
  sessionId:     string;
  questionCount: number;
  startedAt:     string;
}

export default function SessionsTabScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();

  // Primary data — past recommendations (drives most of the tab)
  const recsSwr = useSWR<RecommendationSummary[]>(
    '/api/discovery/recommendations',
    (url: string) => api<RecommendationSummary[]>(url),
    { revalidateOnFocus: true },
  );
  // Incomplete discovery sessions
  const incompleteSwr = useSWR<IncompleteSession | null>(
    '/api/discovery/sessions/incomplete',
    async (url: string) => {
      try { return await api<IncompleteSession | null>(url); }
      catch { return null; }
    },
  );

  const recs = recsSwr.data;
  const incomplete = incompleteSwr.data;
  const isLoading = recsSwr.isLoading;
  const error     = recsSwr.error;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    void Haptics.selectionAsync();
    setRefreshing(true);
    try { await Promise.all([recsSwr.mutate(), incompleteSwr.mutate()]); }
    finally { setRefreshing(false); }
  }, [recsSwr, incompleteSwr]);

  function startDiscovery() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/discovery');
  }

  function openRec(id: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/recommendation/${id}`);
  }

  if (error && !recs) {
    const kind = error instanceof ApiError && error.status === 401 ? 'auth'
      : error instanceof ApiError && error.status === 0 ? 'network'
      : 'generic';
    return (
      <ScreenContainer>
        <ErrorState kind={kind} onRetry={() => void recsSwr.mutate()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.header}>
        <Text variant="caption" color={c.mutedForeground}>Your journey</Text>
        <Text variant="heading">Sessions</Text>
      </View>

      {/* New discovery CTA */}
      <Card variant="primary" style={styles.ctaCard}>
        <Text variant="overline" color={c.primary}>Start fresh</Text>
        <Text variant="body" style={{ marginTop: spacing[2], marginBottom: spacing[4] }}>
          A new conversation. A new picture of where you are. One honest
          recommendation tailored to your situation.
        </Text>
        <Button
          title="Start new discovery"
          onPress={startDiscovery}
          size="md"
          icon={<Compass size={iconSize.md} color={c.primaryForeground} />}
        />
      </Card>

      {/* Active / paused session */}
      {incomplete && (
        <View style={styles.section}>
          <Text variant="overline" color={c.mutedForeground}>Paused</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Resume paused discovery, ${incomplete.questionCount} questions answered`}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/discovery');
            }}
            style={{ marginTop: spacing[2] }}
          >
            <Card>
              <View style={styles.sessionHeader}>
                <Pause size={iconSize.sm} color={c.warning} />
                <Text variant="label" style={{ flex: 1 }}>Discovery interview in progress</Text>
                <ArrowRight size={iconSize.sm} color={c.mutedForeground} />
              </View>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                {incomplete.questionCount} question{incomplete.questionCount === 1 ? '' : 's'} answered. Pick up where you left off.
              </Text>
            </Card>
          </Pressable>
        </View>
      )}

      {/* Recommendations */}
      {isLoading && !recs ? (
        <View style={styles.section}>
          <ListSkeleton count={3} />
        </View>
      ) : recs && recs.length > 0 ? (
        <>
          <Separator />
          <View style={styles.section}>
            <Text variant="overline" color={c.mutedForeground}>Recommendations</Text>
            <FlatList
              scrollEnabled={false}
              data={recs}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={c.primary}
                  colors={[c.primary]}
                />
              }
              renderItem={({ item }) => {
                const accepted = !!item.acceptedAt;
                const Icon = accepted ? CheckCircle2 : PlayCircle;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${accepted ? 'Accepted' : 'Pending'} recommendation: ${item.path}`}
                    onPress={() => openRec(item.id)}
                  >
                    <Card style={styles.recCard}>
                      <View style={styles.sessionHeader}>
                        <Icon size={iconSize.sm} color={accepted ? c.success : c.primary} />
                        <Badge
                          label={accepted ? 'Accepted' : 'Pending'}
                          variant={accepted ? 'success' : 'warning'}
                        />
                        <Text variant="caption" color={c.mutedForeground} style={{ marginLeft: 'auto' }}>
                          {new Date(item.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text variant="label" numberOfLines={2} style={{ marginTop: spacing[2] }}>
                        {item.path}
                      </Text>
                      <Text variant="caption" color={c.mutedForeground} numberOfLines={2} style={{ marginTop: spacing[1] }}>
                        {item.summary}
                      </Text>
                    </Card>
                  </Pressable>
                );
              }}
            />
          </View>
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  ctaCard: {
    marginBottom: spacing[4],
  },
  section: {
    marginTop: spacing[4],
  },
  list: {
    gap: spacing[3],
    marginTop: spacing[2],
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  recCard: {
    gap: spacing[0.5],
  },
});
