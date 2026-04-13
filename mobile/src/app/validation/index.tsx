// src/app/validation/index.tsx
//
// Validation dashboard — lists the founder's validation pages with
// status, visitor count, signal strength, and build brief readiness.

import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Card, Badge, ScreenContainer } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

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

  const { data: pages, isLoading } = useSWR<ValidationPageSummary[]>(
    '/api/discovery/validation-pages',
    (url: string) => api<ValidationPageSummary[]>(url),
    { revalidateOnFocus: true },
  );

  function handlePagePress(pageId: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/validation/${pageId}`);
  }

  const statusVariant: Record<string, 'success' | 'warning' | 'muted'> = {
    LIVE:     'success',
    DRAFT:    'warning',
    ARCHIVED: 'muted',
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Validation Pages',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <ScreenContainer scroll={false}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={c.primary} />
          </View>
        ) : !pages || pages.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="body" color={c.mutedForeground} align="center">
              You haven't built a validation page yet.
            </Text>
            <Text variant="caption" color={c.mutedForeground} align="center" style={{ marginTop: spacing[1] }}>
              Start from a recommendation to create one.
            </Text>
          </View>
        ) : (
          <FlatList
            data={pages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable onPress={() => handlePagePress(item.id)}>
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
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
  },
  list: {
    padding: spacing[5],
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
