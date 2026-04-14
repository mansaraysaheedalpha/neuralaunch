// src/app/roadmap/[id]/outreach.tsx
//
// Outreach Composer — generates personalised outreach messages for
// cold emails, LinkedIn, WhatsApp. Founder describes who they're
// reaching out to and why, the AI produces 3 message variations.

import { useState, useRef } from 'react';
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Share, TextInput as RNTextInput } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Check, Share2 } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, Card, Button, Badge, ScreenContainer } from '@/components/ui';
import { spacing, radius, typography, iconSize } from '@/constants/theme';

type Channel = 'email' | 'linkedin' | 'whatsapp' | 'sms';

interface Variation {
  id:        string;
  channel:   Channel;
  subject?:  string;
  message:   string;
  tone:      string;
}

const CHANNELS: Array<{ id: Channel; label: string }> = [
  { id: 'email',    label: 'Email' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'sms',      label: 'SMS' },
];

export default function OutreachComposerScreen() {
  const { id: roadmapId, taskId } = useLocalSearchParams<{ id: string; taskId?: string }>();
  const { colors: c } = useTheme();
  const router = useRouter();

  const [channel, setChannel]       = useState<Channel | null>(null);
  const [recipient, setRecipient]   = useState('');
  const [purpose, setPurpose]       = useState('');
  const [generating, setGenerating] = useState(false);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [copiedId, setCopiedId]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const canGenerate =
    channel !== null && recipient.trim().length > 0 && purpose.trim().length > 0 && !generating;

  async function handleGenerate() {
    if (!canGenerate || !roadmapId) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerating(true);
    setError(null);

    try {
      const basePath = taskId
        ? `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer/generate`
        : `/api/discovery/roadmaps/${roadmapId}/composer/generate`;

      const data = await api<{ variations: Variation[] }>(basePath, {
        method: 'POST',
        body: {
          channel,
          recipient: recipient.trim(),
          purpose: purpose.trim(),
        },
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVariations(data.variations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy(variation: Variation) {
    const fullText = variation.subject
      ? `Subject: ${variation.subject}\n\n${variation.message}`
      : variation.message;
    await Clipboard.setStringAsync(fullText);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedId(variation.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleShare(variation: Variation) {
    const fullText = variation.subject
      ? `Subject: ${variation.subject}\n\n${variation.message}`
      : variation.message;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await Share.share({
        message: fullText,
        // iOS uses `title` for mail-subject & some activity types;
        // Android ignores it in the chooser but respects it for some
        // targets. Fall back to the tone so there's always a title.
        title: variation.subject ?? `Outreach (${variation.tone})`,
      });
      if (result.action === Share.sharedAction) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch { /* user cancelled or native error — silent */ }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Outreach Composer',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <ScreenContainer keyboardAvoid>
        {/* Input form */}
        <Text variant="title">Who are you reaching out to?</Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1], marginBottom: spacing[5] }}>
          I'll generate three message variations tailored to your market,
          your product, and the person you're writing to.
        </Text>

        {/* Channel selection */}
        <Text variant="overline" color={c.mutedForeground} style={{ marginBottom: spacing[2] }}>
          Channel
        </Text>
        <View style={styles.channelRow}>
          {CHANNELS.map(ch => {
            const isSelected = channel === ch.id;
            return (
              <Pressable
                key={ch.id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setChannel(ch.id);
                }}
                style={[
                  styles.channelPill,
                  {
                    backgroundColor: isSelected ? c.primaryAlpha10 : c.card,
                    borderColor: isSelected ? c.primary : c.border,
                  },
                ]}
              >
                <Text variant="label" color={isSelected ? c.primary : c.foreground}>
                  {ch.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Recipient */}
        <View style={styles.inputGroup}>
          <Text variant="overline" color={c.mutedForeground} style={{ marginBottom: spacing[2] }}>
            Who are you writing to?
          </Text>
          <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border }]}>
            <RNTextInput
              value={recipient}
              onChangeText={setRecipient}
              placeholder="e.g. 'Operations manager at a local hotel I've never met'"
              placeholderTextColor={c.placeholder}
              multiline
              maxLength={500}
              style={styles.input}
            />
          </View>
        </View>

        {/* Purpose */}
        <View style={styles.inputGroup}>
          <Text variant="overline" color={c.mutedForeground} style={{ marginBottom: spacing[2] }}>
            What do you need from them?
          </Text>
          <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border }]}>
            <RNTextInput
              value={purpose}
              onChangeText={setPurpose}
              placeholder="e.g. 'Get a 15-minute call to pitch my laundry service'"
              placeholderTextColor={c.placeholder}
              multiline
              maxLength={2000}
              style={[styles.input, { minHeight: 80 }]}
            />
          </View>
        </View>

        {error && (
          <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[2] }}>
            {error}
          </Text>
        )}

        {/* Generate button */}
        <Button
          title={generating ? 'Writing your messages…' : 'Generate 3 variations'}
          onPress={handleGenerate}
          loading={generating}
          disabled={!canGenerate}
          size="lg"
          fullWidth
          style={{ marginTop: spacing[6] }}
        />

        {/* Variations */}
        {variations.length > 0 && (
          <View style={styles.variationsSection}>
            <Text variant="title">Your messages</Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1], marginBottom: spacing[4] }}>
              Three tones to pick from. Tap the copy button on the one
              that fits best.
            </Text>

            <View style={{ gap: spacing[3] }}>
              {variations.map(variation => (
                <Card key={variation.id}>
                  <View style={styles.variationHeader}>
                    <Badge label={variation.tone} variant="primary" />
                    <View style={styles.iconActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Share message"
                        onPress={() => { void handleShare(variation); }}
                        style={styles.copyButton}
                      >
                        <Share2 size={iconSize.sm} color={c.mutedForeground} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={copiedId === variation.id ? 'Copied' : 'Copy message'}
                        onPress={() => { void handleCopy(variation); }}
                        style={styles.copyButton}
                      >
                        {copiedId === variation.id ? (
                          <Check size={iconSize.sm} color={c.success} />
                        ) : (
                          <Copy size={iconSize.sm} color={c.mutedForeground} />
                        )}
                      </Pressable>
                    </View>
                  </View>

                  {variation.subject && (
                    <>
                      <Text variant="overline" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
                        Subject
                      </Text>
                      <Text variant="label" style={{ marginTop: spacing[0.5] }}>
                        {variation.subject}
                      </Text>
                    </>
                  )}

                  <Text variant="body" style={{ marginTop: spacing[3] }}>
                    {variation.message}
                  </Text>
                </Card>
              ))}
            </View>

            {/* Regenerate + done */}
            <Button
              title="Generate new variations"
              onPress={handleGenerate}
              variant="ghost"
              size="md"
              fullWidth
              style={{ marginTop: spacing[4] }}
            />
            {roadmapId && (
              <Button
                title="Done — back to my roadmap"
                // Use replace with an explicit target so a deep-link
                // into this screen (push notification, share URL,
                // external browser) still navigates somewhere sensible
                // — router.back() silently does nothing on an empty
                // back stack.
                onPress={() => router.replace(`/roadmap/${roadmapId}`)}
                variant="secondary"
                size="md"
                fullWidth
                style={{ marginTop: spacing[2] }}
              />
            )}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[5],
  },
  channelPill: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  inputGroup: {
    marginBottom: spacing[4],
  },
  textArea: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing[3],
  },
  input: {
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.leading.relaxed,
    minHeight: 44,
    textAlignVertical: 'top',
    color: undefined, // inherited
  },
  variationsSection: {
    marginTop: spacing[8],
  },
  variationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconActions: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  copyButton: {
    padding: spacing[2],
  },
});
