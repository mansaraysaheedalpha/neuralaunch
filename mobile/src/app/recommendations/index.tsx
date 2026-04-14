// src/app/recommendations/index.tsx
//
// Past recommendations list — shows all recommendations for the
// current user, newest first, with status and path.

import { useState, useCallback } from 'react';
import { View, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import {
  Text,
  Card,
  Badge,
  ScreenContainer,
  ListSkeleton,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { spacing } from '@/constants/theme';

interface RecommendationSummary {
  id:                 string;
  path:               string;
  summary:            string;
  acceptedAt:         string | null;
  recommendationType: string | null;
  createdAt:          string;
}

export default function RecommendationsListScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();

  const { data: recommendations, isLoading, error, mutate } = useSWR<RecommendationSummary[]>(
    '/api/discovery/recommendations',
    (url: string) => api<RecommendationSummary[]>(url),
    { revalidateOnFocus: true },
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    void Haptics.selectionAsync();
    setRefreshing(true);
    try { await mutate(); }
    finally { setRefreshing(false); }
  }, [mutate]);

  const headerOpts = (
    <Stack.Screen
      options={{
        headerShown: true,
        headerTitle: 'Past Recommendations',
        headerTintColor: c.foreground,
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
      }}
    />
  );

  if (error && !recommendations) {
    const kind = error instanceof ApiError && error.status === 401 ? 'auth'
      : error instanceof ApiError && error.status === 0 ? 'network'
      : 'generic';
    return (
      <>
        {headerOpts}
        <ScreenContainer scroll={false}>
          <ErrorState kind={kind} onRetry={() => void mutate()} />
        </ScreenContainer>
      </>
    );
  }

  if (isLoading && !recommendations) {
    return (
      <>
        {headerOpts}
        <ScreenContainer>
          <ListSkeleton count={4} />
        </ScreenContainer>
      </>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <>
        {headerOpts}
        <ScreenContainer scroll={false}>
          <EmptyState
            icon={Sparkles}
            title="No recommendations yet"
            message="Start a discovery session to get your first personalised recommendation."
            actionLabel="Start Discovery"
            onAction={() => router.push('/discovery')}
          />
        </ScreenContainer>
      </>
    );
  }

  return (
    <>
      {headerOpts}
      <ScreenContainer scroll={false}>
        <FlatList
          data={recommendations}
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
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View recommendation: ${item.path}`}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/recommendation/${item.id}`);
              }}
            >
              <Card>
                <View style={styles.recHeader}>
                  <Badge
                    label={item.acceptedAt ? 'Accepted' : 'Pending'}
                    variant={item.acceptedAt ? 'success' : 'warning'}
                  />
                  <Text variant="caption" color={c.mutedForeground}>
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
          )}
        />
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: spacing[5],
    gap: spacing[3],
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
