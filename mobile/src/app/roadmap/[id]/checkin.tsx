// src/app/roadmap/[id]/checkin.tsx
//
// Check-in screen — the founder selects a category (completed,
// blocked, unexpected, question), types their update, submits,
// and gets a structured AI response. This is the daily-driver
// interaction for every founder executing their roadmap.

import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, Card, Button, ScreenContainer, Badge } from '@/components/ui';
import { spacing, radius, typography } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckInCategory = 'completed' | 'blocked' | 'unexpected' | 'question';

interface CheckInResponse {
  entry: {
    agentResponse: string;
    agentAction:   string;
  };
  progress: {
    totalTasks:     number;
    completedTasks: number;
  };
  flaggedFundamental: boolean;
  recommendationId:   string;
}

const CATEGORIES: Array<{
  id: CheckInCategory;
  label: string;
  emoji: string;
  placeholder: string;
}> = [
  {
    id: 'completed',
    label: 'Completed',
    emoji: '✓',
    placeholder: 'Anything worth noting about how it went?',
  },
  {
    id: 'blocked',
    label: 'Blocked',
    emoji: '⊘',
    placeholder: 'What specifically is blocking you?',
  },
  {
    id: 'unexpected',
    label: 'Something unexpected',
    emoji: '!',
    placeholder: 'What happened that you did not expect?',
  },
  {
    id: 'question',
    label: 'I have a question',
    emoji: '?',
    placeholder: 'What do you want to know?',
  },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CheckInScreen() {
  const { id: roadmapId, taskId, recommendationId } = useLocalSearchParams<{
    id: string;
    taskId: string;
    recommendationId: string;
  }>();
  const { colors: c } = useTheme();
  const router = useRouter();

  const [category, setCategory] = useState<CheckInCategory | null>(null);
  const [freeText, setFreeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState<CheckInResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    category !== null
    && (category === 'completed' || freeText.trim().length > 0)
    && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !roadmapId || !taskId) return;
    setSubmitting(true);
    setError(null);

    try {
      const data = await api<CheckInResponse>(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/checkin`,
        {
          method: 'POST',
          body: {
            category,
            freeText: freeText.trim() || `Task marked as ${category}`,
          },
        },
      );

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResponse(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not submit. Try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCategory = CATEGORIES.find(cat => cat.id === category);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Check In',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: c.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Response state — show the agent's response */}
          {response ? (
            <View style={styles.responseContainer}>
              {/* Completion moment */}
              {category === 'completed' && (
                <Card variant="primary" style={styles.completionCard}>
                  <Text variant="title" color={c.primary} align="center">
                    Step complete
                  </Text>
                  <Text variant="caption" color={c.mutedForeground} align="center" style={{ marginTop: spacing[1] }}>
                    {response.progress.completedTasks}/{response.progress.totalTasks} tasks done
                  </Text>
                </Card>
              )}

              {/* Agent response */}
              <Card style={styles.responseCard}>
                <Text variant="body">{response.entry.agentResponse}</Text>
              </Card>

              {/* Flagged fundamental */}
              {response.flaggedFundamental && (
                <Card variant="muted" style={styles.flaggedCard}>
                  <Text variant="label" color={c.destructive}>
                    This might need a bigger conversation
                  </Text>
                  <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                    The issue you raised suggests the recommendation itself
                    may need rethinking.
                  </Text>
                  <Button
                    title="Revisit the recommendation"
                    onPress={() => router.push(`/recommendation/${recommendationId}`)}
                    variant="secondary"
                    size="sm"
                    style={{ marginTop: spacing[3] }}
                  />
                </Card>
              )}

              {/* Done button */}
              <Button
                title="Back to roadmap"
                onPress={() => router.back()}
                variant="secondary"
                size="lg"
                fullWidth
                style={{ marginTop: spacing[4] }}
              />
            </View>
          ) : (
            /* Input state */
            <>
              <Text variant="title">How's it going?</Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                Select what best describes where you are with this task.
              </Text>

              {/* Category pills */}
              <View style={styles.categoryGrid}>
                {CATEGORIES.map(cat => {
                  const isSelected = category === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setCategory(cat.id);
                      }}
                      style={[
                        styles.categoryPill,
                        {
                          backgroundColor: isSelected ? c.primaryAlpha10 : c.card,
                          borderColor: isSelected ? c.primary : c.border,
                        },
                      ]}
                    >
                      <Text
                        variant="label"
                        color={isSelected ? c.primary : c.foreground}
                        align="center"
                      >
                        {cat.emoji} {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Free text input */}
              {category && (
                <View style={styles.inputSection}>
                  <View
                    style={[
                      styles.textArea,
                      { backgroundColor: c.card, borderColor: c.border },
                    ]}
                  >
                    <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                      <View style={{ minHeight: 100 }}>
                        <Pressable onPress={() => { /* focus handled by TextInput */ }}>
                          <View>
                            {/* Using raw RN TextInput here for multiline */}
                            {(() => {
                              const RNTextInput = require('react-native').TextInput;
                              return (
                                <RNTextInput
                                  value={freeText}
                                  onChangeText={setFreeText}
                                  placeholder={selectedCategory?.placeholder}
                                  placeholderTextColor={c.placeholder}
                                  multiline
                                  maxLength={4000}
                                  style={{
                                    color: c.foreground,
                                    fontSize: typography.size.sm,
                                    lineHeight: typography.size.sm * typography.leading.relaxed,
                                    padding: 0,
                                    textAlignVertical: 'top',
                                  }}
                                />
                              );
                            })()}
                          </View>
                        </Pressable>
                      </View>
                    </ScrollView>
                  </View>

                  {category === 'completed' && (
                    <Text variant="caption" color={c.mutedForeground}>
                      Free text is optional for completed tasks.
                    </Text>
                  )}
                </View>
              )}

              {/* Error */}
              {error && (
                <Text variant="caption" color={c.destructive}>
                  {error}
                </Text>
              )}

              {/* Submit */}
              {category && (
                <Button
                  title={submitting ? 'Sending…' : 'Submit check-in'}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[5],
    paddingBottom: spacing[12],
    gap: spacing[2],
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[4],
  },
  categoryPill: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2.5],
    minWidth: '45%',
    flexGrow: 1,
  },
  inputSection: {
    gap: spacing[2],
    marginTop: spacing[4],
  },
  textArea: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing[4],
  },
  responseContainer: {
    gap: spacing[4],
  },
  completionCard: {
    alignItems: 'center',
    paddingVertical: spacing[6],
  },
  responseCard: {
    gap: spacing[2],
  },
  flaggedCard: {
    gap: spacing[1],
  },
});
