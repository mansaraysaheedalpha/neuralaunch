// src/app/recommendations/index.tsx
//
// Past recommendations list — shows all recommendations for the
// current user, newest first, with status and path.

import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Card, Badge, ScreenContainer } from '@/components/ui';
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

  const { data: recommendations, isLoading } = useSWR<RecommendationSummary[]>(
    '/api/discovery/recommendations',
    (url: string) => api<RecommendationSummary[]>(url),
    { revalidateOnFocus: true },
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Past Recommendations',
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
        ) : !recommendations || recommendations.length === 0 ? (
          <View style={styles.centered}>
            <Text variant="body" color={c.mutedForeground} align="center">
              No recommendations yet.
            </Text>
          </View>
        ) : (
          <FlatList
            data={recommendations}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
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
  list: {
    padding: spacing[5],
    gap: spacing[3],
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
