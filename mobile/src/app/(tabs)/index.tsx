// src/app/(tabs)/index.tsx
//
// Home tab — the founder's dashboard. Shows greeting, discovery CTA,
// most recent recommendation summary, and active roadmap progress.

import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { useAuth } from '@/services/auth';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Card, Button, Badge, ScreenContainer, Separator } from '@/components/ui';
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

  const { data: recommendations, isLoading } = useSWR<RecommendationSummary[]>(
    '/api/discovery/recommendations',
    (url: string) => api<RecommendationSummary[]>(url),
    { revalidateOnFocus: true },
  );

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const latestRec = recommendations?.[0] ?? null;

  return (
    <ScreenContainer>
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
        />
      </Card>

      {/* Latest recommendation */}
      <View style={styles.section}>
        <Text variant="title" style={styles.sectionTitle}>
          Your recommendations
        </Text>

        {isLoading ? (
          <ActivityIndicator size="small" color={c.primary} />
        ) : latestRec ? (
          <Pressable
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
              <Text variant="label" color={c.primary} style={{ marginTop: spacing[3] }}>
                View recommendation →
              </Text>
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
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/validation' as any);
          }}
          style={[styles.quickLink, { borderColor: c.border }]}
        >
          <Text variant="label">Validation Pages</Text>
          <Text variant="caption" color={c.mutedForeground}>Test your ideas</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/tools' as any);
          }}
          style={[styles.quickLink, { borderColor: c.border }]}
        >
          <Text variant="label">Tools</Text>
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
  quickLinks: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  quickLink: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing[4],
    gap: spacing[0.5],
  },
});
