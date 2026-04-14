// src/app/(tabs)/index.tsx
//
// Home tab — the founder's dashboard. Shows greeting, discovery CTA,
// most recent recommendation summary, and active roadmap progress.

import { useState, useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { Compass, FileCheck, Zap, ArrowRight } from 'lucide-react-native';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import {
  Text,
  Card,
  Button,
  Badge,
  ScreenContainer,
  Separator,
  ListSkeleton,
  ErrorState,
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

export default function HomeScreen() {
  const { user } = useAuth();
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

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const latestRec = recommendations?.[0] ?? null;

  // Hard error — show full error state (only if we have no cached data)
  if (error && !recommendations) {
    const kind = error instanceof ApiError && error.status === 401 ? 'auth'
      : error instanceof ApiError && error.status === 0 ? 'network'
      : 'generic';
    return (
      <ScreenContainer>
        <ErrorState kind={kind} onRetry={() => void mutate()} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={onRefresh}>
      {/* Greeting */}
      <View style={styles.header}>
        <Text variant="caption" color={c.mutedForeground}>
          Welcome back
        </Text>
        <Text variant="heading">{firstName}</Text>
      </View>

      {/* Quick action — start a discovery session */}
      <Card variant="primary" style={styles.ctaCard}>
        <Text variant="overline" color={c.primary}>
          Ready to discover your path?
        </Text>
        <Text
          variant="body"
          style={{ marginTop: spacing[2], marginBottom: spacing[4] }}
        >
          Start a conversation and get one honest recommendation
          tailored to your exact situation.
        </Text>
        <Button
          title="Start Discovery"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/discovery');
          }}
          size="md"
          icon={<Compass size={18} color={c.primaryForeground} />}
        />
      </Card>

      {/* Latest recommendation */}
      <View style={styles.section}>
        <Text variant="title" style={styles.sectionTitle}>
          Your recommendations
        </Text>

        {isLoading && !recommendations ? (
          <ListSkeleton count={2} />
        ) : latestRec ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View recommendation: ${latestRec.path}`}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/recommendation/${latestRec.id}`);
            }}
          >
            <Card>
              <View style={styles.recHeader}>
                <Badge
                  label={latestRec.acceptedAt ? 'Accepted' : 'Pending'}
                  variant={latestRec.acceptedAt ? 'success' : 'warning'}
                />
                {latestRec.recommendationType && (
                  <Text variant="caption" color={c.mutedForeground}>
                    {latestRec.recommendationType.replace(/_/g, ' ')}
                  </Text>
                )}
              </View>
              <Text variant="label" numberOfLines={2} style={{ marginTop: spacing[2] }}>
                {latestRec.path}
              </Text>
              <Text variant="caption" color={c.mutedForeground} numberOfLines={2} style={{ marginTop: spacing[1] }}>
                {latestRec.summary}
              </Text>
              <View style={styles.recCta}>
                <Text variant="label" color={c.primary}>
                  View recommendation
                </Text>
                <ArrowRight size={16} color={c.primary} />
              </View>
            </Card>
          </Pressable>
        ) : (
          <Card>
            <Text variant="body" color={c.mutedForeground}>
              No recommendations yet. Start a discovery session to get
              your first one.
            </Text>
          </Card>
        )}

        {/* Show more link if multiple */}
        {recommendations && recommendations.length > 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View all recommendations"
            onPress={() => router.push('/recommendations')}
            style={{ marginTop: spacing[2] }}
          >
            <Text variant="label" color={c.primary} align="center">
              View all {recommendations.length} recommendations →
            </Text>
          </Pressable>
        )}
      </View>

      <Separator />

      {/* Quick links */}
      <View style={styles.quickLinks}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Validation Pages"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/validation' as any);
          }}
          style={[styles.quickLink, { borderColor: c.border }]}
        >
          <FileCheck size={20} color={c.primary} />
          <Text variant="label" style={{ marginTop: spacing[2] }}>Validation</Text>
          <Text variant="caption" color={c.mutedForeground}>Test your ideas</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tools"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/tools' as any);
          }}
          style={[styles.quickLink, { borderColor: c.border }]}
        >
          <Zap size={20} color={c.primary} />
          <Text variant="label" style={{ marginTop: spacing[2] }}>Tools</Text>
          <Text variant="caption" color={c.mutedForeground}>Coach, outreach</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  ctaCard: {
    marginBottom: spacing[6],
  },
  section: {
    marginBottom: spacing[2],
  },
  sectionTitle: {
    marginBottom: spacing[3],
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  recCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[3],
  },
  quickLinks: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  quickLink: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing[4],
  },
});
