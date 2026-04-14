// src/app/recommendation/[id]/outcome.tsx
//
// Outcome capture screen — the founder records how the recommendation
// worked out. Four outcome types, optional free text (required for
// did_not_work), weak-phases follow-up, consent display.

import { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, TextInput as RNTextInput } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, Card, Button, ScreenContainer } from '@/components/ui';
import { spacing, radius, typography } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types — mirror outcome-types.ts from the web app
// ---------------------------------------------------------------------------

type OutcomeType =
  | 'full_success'
  | 'partial_success'
  | 'direction_correct_execution_different'
  | 'did_not_work';

interface OutcomeCopy {
  cardTitle:       string;
  cardSubtitle:    string;
  freeTextPrompt:  string;
  freeTextRequired: boolean;
}

const OUTCOMES: Array<{ type: OutcomeType; copy: OutcomeCopy }> = [
  {
    type: 'full_success',
    copy: {
      cardTitle:       'It worked as described',
      cardSubtitle:    'I followed the recommendation and reached what I set out to do.',
      freeTextPrompt:  'Anything worth noting about how it went? (optional)',
      freeTextRequired: false,
    },
  },
  {
    type: 'partial_success',
    copy: {
      cardTitle:       'Mostly the right path, with adaptation',
      cardSubtitle:    'It got me most of the way there but I had to adapt significantly.',
      freeTextPrompt:  'What did you have to adapt? (optional)',
      freeTextRequired: false,
    },
  },
  {
    type: 'direction_correct_execution_different',
    copy: {
      cardTitle:       'Right direction, different execution',
      cardSubtitle:    'The path was right but the steps needed more adjustment than anticipated.',
      freeTextPrompt:  'What changed about how you actually executed it? (optional)',
      freeTextRequired: false,
    },
  },
  {
    type: 'did_not_work',
    copy: {
      cardTitle:       'I took a different path — and here is what I learned',
      cardSubtitle:    'The recommendation was not right for my situation.',
      freeTextPrompt:  'What would have made this recommendation more accurate for your situation?',
      freeTextRequired: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OutcomeScreen() {
  const { id: recommendationId } = useLocalSearchParams<{ id: string }>();
  const { colors: c } = useTheme();
  const router = useRouter();

  const [selected, setSelected] = useState<OutcomeType | null>(null);
  const [freeText, setFreeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch consent state
  const { data: consentData } = useSWR<{ consent: boolean }>(
    '/api/user/training-consent',
    (url: string) => api<{ consent: boolean }>(url),
  );

  const selectedOutcome = OUTCOMES.find(o => o.type === selected);
  const canSubmit =
    selected !== null
    && (!selectedOutcome?.copy.freeTextRequired || freeText.trim().length > 0)
    && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !recommendationId) return;
    setSubmitting(true);
    setError(null);

    try {
      await api(`/api/discovery/recommendations/${recommendationId}/outcome`, {
        method: 'POST',
        body: {
          outcomeType: selected,
          freeText: freeText.trim() || undefined,
          weakPhases: [],
          consentedToTraining: consentData?.consent ?? false,
        },
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'How did it go?',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <ScreenContainer keyboardAvoid>
        {submitted ? (
          <View style={styles.successContainer}>
            <Card variant="primary" style={{ alignItems: 'center', paddingVertical: spacing[8] }}>
              <Text variant="title" color={c.primary}>Thank you</Text>
              <Text variant="body" color={c.mutedForeground} align="center" style={{ marginTop: spacing[2] }}>
                Your feedback helps NeuraLaunch give better recommendations
                to every founder who comes after you.
              </Text>
            </Card>
            <Button
              title="Back to recommendations"
              onPress={() => router.back()}
              variant="secondary"
              size="lg"
              fullWidth
              style={{ marginTop: spacing[6] }}
            />
          </View>
        ) : (
          <>
            <Text variant="body" color={c.mutedForeground}>
              The single most valuable thing you can do for NeuraLaunch — and for
              every founder who comes after you — is tell the truth about what happened.
            </Text>

            {/* Outcome cards */}
            <View style={styles.outcomeList}>
              {OUTCOMES.map(({ type, copy }) => {
                const isSelected = selected === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelected(type);
                    }}
                  >
                    <Card
                      variant={isSelected ? 'primary' : 'default'}
                      style={[
                        styles.outcomeCard,
                        isSelected && { borderColor: c.primary, borderWidth: 2 },
                      ]}
                    >
                      <Text variant="label">{copy.cardTitle}</Text>
                      <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
                        {copy.cardSubtitle}
                      </Text>
                    </Card>
                  </Pressable>
                );
              })}
            </View>

            {/* Free text */}
            {selected && selectedOutcome && (
              <View style={styles.freeTextSection}>
                <Text variant="caption" color={c.mutedForeground} style={{ marginBottom: spacing[2] }}>
                  {selectedOutcome.copy.freeTextPrompt}
                </Text>
                <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border }]}>
                  <RNTextInput
                    value={freeText}
                    onChangeText={setFreeText}
                    placeholder="Your thoughts…"
                    placeholderTextColor={c.placeholder}
                    multiline
                    maxLength={4000}
                    style={{
                      color: c.foreground,
                      fontSize: typography.size.sm,
                      lineHeight: typography.size.sm * typography.leading.relaxed,
                      minHeight: 80,
                      textAlignVertical: 'top',
                    }}
                  />
                </View>
              </View>
            )}

            {/* Consent note */}
            {consentData && (
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
                Training data consent: {consentData.consent ? 'enabled' : 'disabled'}.
                {consentData.consent
                  ? ' An anonymised version of this outcome will be stored to improve future recommendations.'
                  : ' No training data will be stored from this submission.'}
              </Text>
            )}

            {/* Error */}
            {error && (
              <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[2] }}>
                {error}
              </Text>
            )}

            {/* Submit */}
            {selected && (
              <Button
                title={submitting ? 'Submitting…' : 'Submit'}
                onPress={handleSubmit}
                loading={submitting}
                disabled={!canSubmit}
                size="lg"
                fullWidth
                style={{ marginTop: spacing[4] }}
              />
            )}
          </>
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  successContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  outcomeList: {
    gap: spacing[2],
    marginTop: spacing[4],
  },
  outcomeCard: {
    gap: spacing[0.5],
  },
  freeTextSection: {
    marginTop: spacing[4],
  },
  textArea: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing[4],
  },
});
