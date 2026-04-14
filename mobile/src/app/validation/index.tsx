// src/app/validation/index.tsx
//
// Validation dashboard — lists the founder's validation pages with
// status, visitor count, signal strength, and build brief readiness.

import { useState, useCallback } from 'react';
import { View, FlatList, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { FileCheck } from 'lucide-react-native';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationPageSummary {
  id:                string;
  slug:              string;
  status:            'DRAFT' | 'LIVE' | 'ARCHIVED';
  recommendationPath: string | null;
  visitorCount:      number;
  signalStrength:    string | null;
  hasReport:         boolean;
  channelsShared:    number;
  updatedAt:         string;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ValidationDashboardScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();

  const { data: pages, isLoading, error, mutate } = useSWR<ValidationPageSummary[]>(
    '/api/discovery/validation-pages',
    (url: string) => api<ValidationPageSummary[]>(url),
    { revalidateOnFocus: true },
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    void Haptics.selectionAsync();
    setRefreshing(true);
    try { await mutate(); }
    finally { setRefreshing(false); }
  }, [mutate]);

  function handlePagePress(pageId: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/validation/${pageId}`);
  }

  const statusVariant: Record<string, 'success' | 'warning' | 'muted'> = {
    LIVE:     'success',
    DRAFT:    'warning',
    ARCHIVED: 'muted',
  };

  const headerOpts = (
    <Stack.Screen
      options={{
        headerShown: true,
        headerTitle: 'Validation Pages',
        headerTintColor: c.foreground,
        headerStyle: { backgroundColor: c.background },
        headerShadowVisible: false,
      }}
    />
  );

  // Hard error — show full error state (only if no cached data)
  if (error && !pages) {
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

  if (isLoading && !pages) {
    return (
      <>
        {headerOpts}
        <ScreenContainer>
          <ListSkeleton count={3} />
        </ScreenContainer>
      </>
    );
  }

  if (!pages || pages.length === 0) {
    return (
      <>
        {headerOpts}
        <ScreenContainer scroll={false}>
          <EmptyState
            icon={FileCheck}
            title="No validation pages yet"
            message="Start from a recommendation to build a landing page, share it, and watch signal land."
            actionLabel="Go to recommendations"
            onAction={() => router.push('/recommendations')}
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
          data={pages}
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
              accessibilityLabel={`Open validation page: ${item.recommendationPath ?? item.slug}`}
              onPress={() => handlePagePress(item.id)}
            >
              <Card style={styles.pageCard}>
                <View style={styles.pageHeader}>
                  <Badge
                    label={item.status.toLowerCase()}
                    variant={statusVariant[item.status] ?? 'muted'}
                  />
                  {item.hasReport && (
                    <Badge label="Build brief ready" variant="primary" />
                  )}
                </View>

                <Text variant="label" style={{ marginTop: spacing[2] }} numberOfLines={2}>
                  {item.recommendationPath ?? 'Untitled page'}
                </Text>

                <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
                  /lp/{item.slug}
                </Text>

                <View style={styles.metaRow}>
                  <Text variant="caption" color={c.mutedForeground}>
                    {item.visitorCount} visitor{item.visitorCount === 1 ? '' : 's'}
                  </Text>
                  {item.signalStrength && (
                    <Text variant="caption" color={c.mutedForeground}>
                      signal: {item.signalStrength}
                    </Text>
                  )}
                  {item.status === 'LIVE' && (
                    <Text variant="caption" color={c.mutedForeground}>
                      {item.channelsShared} shared
                    </Text>
                  )}
                </View>
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
  pageCard: {
    gap: spacing[1],
  },
  pageHeader: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing[4],
    marginTop: spacing[2],
  },
});
