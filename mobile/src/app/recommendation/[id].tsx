// src/app/recommendation/[id].tsx
//
// Recommendation reveal screen — the full recommendation with all
// sections, accept/roadmap CTA, pushback chat, and alternative link.
// This is the screen the discovery chat redirects to after synthesis.

import { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, Link } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { useRecommendation } from '@/hooks/useRecommendation';
import { api, ApiError } from '@/services/api-client';
import {
  Text,
  Card,
  Button,
  Badge,
  Separator,
  ScreenContainer,
  CollapsibleSection,
  ListSkeleton,
  ErrorState,
} from '@/components/ui';
import { PushbackChat } from '@/components/recommendation/PushbackChat';
import { AssumptionRow } from '@/components/recommendation/AssumptionRow';
import { spacing } from '@/constants/theme';

// Pushback hard cap — matches the web app's PUSHBACK_CONFIG.HARD_CAP_ROUND
const HARD_CAP_ROUND = 7;

export default function RecommendationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useTheme();
  const router = useRouter();
  const { recommendation: r, isLoading, error, refresh } = useRecommendation(id ?? null);

  const [accepting, setAccepting]   = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  if (error && !r) {
    const kind = error instanceof ApiError && error.status === 401 ? 'auth'
      : error instanceof ApiError && error.status === 0 ? 'network'
      : 'generic';
    return (
      <ScreenContainer>
        <ErrorState kind={kind} onRetry={() => void refresh()} />
      </ScreenContainer>
    );
  }

  if (isLoading || !r) {
    return (
      <ScreenContainer>
        <View style={{ marginTop: spacing[8] }}>
          <ListSkeleton count={5} />
        </View>
      </ScreenContainer>
    );
  }

  const isAccepted = !!r.acceptedAt;
  const alternativeReady = !!r.alternativeRecommendationId;

  async function handleAcceptAndGenerateRoadmap() {
    if (!id) return;
    setAccepting(true);
    setAcceptError(null);

    try {
      // Step 1 — accept
      await api(`/api/discovery/recommendations/${id}/accept`, { method: 'POST' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Step 2 — trigger roadmap generation
      await api(`/api/discovery/recommendations/${id}/roadmap`, { method: 'POST' });

      // Navigate to roadmap viewer (it polls GENERATING → READY)
      router.push(`/roadmap/${id}`);
    } catch (err) {
      setAcceptError(
        err instanceof ApiError ? err.message : 'Something went wrong. Try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Your Recommendation',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <ScreenContainer>
        {/* Summary card — always visible */}
        <View>
          <Card variant="primary">
            <Text variant="overline" color={c.primary}>
              Your Recommendation
            </Text>
            <Text variant="body" style={{ marginTop: spacing[2] }}>
              {r.summary}
            </Text>
          </Card>
        </View>

        {/* What would make this wrong */}
        <View style={styles.section}>
          <Text variant="overline" color={c.mutedForeground}>
            What Would Make This Wrong
          </Text>
          <Text variant="body" color={c.mutedForeground} style={styles.italic}>
            {r.whatWouldMakeThisWrong}
          </Text>
        </View>

        {/* Your Path */}
        <CollapsibleSection label="Your Path">
          <Text variant="title">{r.path}</Text>
        </CollapsibleSection>

        {/* Why This Fits You */}
        <CollapsibleSection label="Why This Fits You">
          <Text variant="body" color={c.foreground} style={{ opacity: 0.9 }}>
            {r.reasoning}
          </Text>
        </CollapsibleSection>

        {/* First Three Steps */}
        <CollapsibleSection label="First Three Steps">
          <View style={styles.stepsList}>
            {r.firstThreeSteps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={[styles.stepNumber, { backgroundColor: c.primaryAlpha10 }]}>
                  <Text variant="label" color={c.primary}>{i + 1}</Text>
                </View>
                <Text variant="body" style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        </CollapsibleSection>

        {/* Time to First Result */}
        <CollapsibleSection label="Time to First Result">
          <Text variant="label">{r.timeToFirstResult}</Text>
        </CollapsibleSection>

        {/* Risks & Mitigations */}
        <CollapsibleSection label="Risks & Mitigations">
          <View style={{ gap: spacing[2] }}>
            {r.risks.map((row, i) => (
              <Card key={i}>
                <Text variant="label">{row.risk}</Text>
                <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                  {row.mitigation}
                </Text>
              </Card>
            ))}
          </View>
        </CollapsibleSection>

        {/* Assumptions */}
        <CollapsibleSection label="Assumptions">
          <View style={{ gap: spacing[3] }}>
            {r.assumptions.map((a, i) => (
              <AssumptionRow
                key={i}
                text={a}
                path={r.path}
                reasoning={r.reasoning}
              />
            ))}
          </View>
        </CollapsibleSection>

        {/* Alternatives Considered & Rejected */}
        <CollapsibleSection label="Alternatives Considered & Rejected">
          <View style={{ gap: spacing[3] }}>
            {r.alternativeRejected.map((alt, idx) => (
              <Card key={idx}>
                <Text variant="label">{alt.alternative}</Text>
                <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                  {alt.whyNotForThem}
                </Text>
              </Card>
            ))}
          </View>
        </CollapsibleSection>

        <Separator />

        {/* Accept + Roadmap CTA */}
        <View style={styles.ctaSection}>
          {r.roadmapReady ? (
            <>
              <Text variant="caption" color={c.mutedForeground}>
                Your execution roadmap is ready.
              </Text>
              <Button
                title="View My Execution Roadmap"
                onPress={() => router.push(`/roadmap/${id}`)}
                size="lg"
                fullWidth
              />
              <Button
                title="Report outcome"
                onPress={() => router.push(`/recommendation/${id}/outcome` as any)}
                variant="ghost"
                size="md"
                fullWidth
              />
            </>
          ) : (
            <>
              <Text variant="caption" color={c.mutedForeground}>
                When you are ready to commit to this path, tap below.
                Your roadmap will be generated immediately.
              </Text>
              <Button
                title={accepting ? 'Building your roadmap…' : 'This is my path — build my roadmap'}
                onPress={handleAcceptAndGenerateRoadmap}
                loading={accepting}
                size="lg"
                fullWidth
              />
              {acceptError && (
                <Text variant="caption" color={c.destructive}>
                  {acceptError}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Pushback chat */}
        {!r.roadmapReady && (
          <View style={styles.pushbackSection}>
            <PushbackChat
              recommendationId={r.id}
              initialHistory={r.pushbackHistory}
              hardCapRound={HARD_CAP_ROUND}
              alternativeReady={alternativeReady}
              accepted={isAccepted}
              onCommit={() => { void refresh(); }}
            />
          </View>
        )}

        {/* Alternative link */}
        {alternativeReady && r.alternativeRecommendationId && (
          <Card variant="muted" style={styles.alternativeCard}>
            <Text variant="overline" color={c.warning}>
              Alternative ready
            </Text>
            <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[1] }}>
              I generated the alternative path you argued for so you
              can compare both.
            </Text>
            <Button
              title="View alternative"
              onPress={() => router.push(`/recommendation/${r.alternativeRecommendationId}`)}
              variant="secondary"
              size="sm"
              style={{ marginTop: spacing[3] }}
            />
          </Card>
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing[1],
    marginTop: spacing[4],
  },
  italic: {
    fontStyle: 'italic',
  },
  stepsList: {
    gap: spacing[3],
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    paddingTop: 2,
  },
  assumptionRow: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  ctaSection: {
    gap: spacing[3],
  },
  pushbackSection: {
    marginTop: spacing[6],
  },
  alternativeCard: {
    marginTop: spacing[4],
  },
});
