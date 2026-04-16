// src/components/outreach/ComposerMessageCard.tsx
//
// One generated outreach message — body, annotation, copy, share,
// regenerate-with-variation, mark-sent, and the Coach handoff when
// the generator suggests the founder should prepare for a live
// conversation off the back of this message.
//
// Stateless with respect to generation: the parent owns the variations
// array + sent state + currently-displayed variation index. This card
// just renders what it's given and forwards actions.

import { useState } from 'react';
import {
  View,
  StyleSheet,
  Share,
  Pressable,
  TextInput as RNTextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Check, Share2, ArrowRight, MessageSquare } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Button, Badge } from '@/components/ui';
import { spacing, radius, typography, iconSize } from '@/constants/theme';

export interface ComposerVariation {
  body:                 string;
  subject?:             string;
  variationInstruction: string;
}

export interface ComposerMessage {
  id:                    string;
  recipientPlaceholder?: string;
  personalisationHook?:  string;
  subject?:              string;
  body:                  string;
  annotation:            string;
  sendTiming?:           string;
  escalationNote?:       string;
  suggestedTool?:        'conversation_coach';
  variations?:           ComposerVariation[];
}

interface Props {
  message:         ComposerMessage;
  isSent:          boolean;
  onMarkSent:      (messageId: string, sent: boolean) => void;
  onRegenerate:    (messageId: string, instruction: string) => Promise<void>;
  onCoachHandoff?: (message: ComposerMessage) => void;
}

const MAX_VARIATIONS = 2;

export function ComposerMessageCard({
  message,
  isSent,
  onMarkSent,
  onRegenerate,
  onCoachHandoff,
}: Props) {
  const { colors: c } = useTheme();
  const [variationIdx, setVariationIdx] = useState(0);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const allVersions: Array<{ body: string; subject?: string }> = [
    { body: message.body, subject: message.subject },
    ...(message.variations ?? []),
  ];
  const current = allVersions[variationIdx] ?? allVersions[0];
  const remaining = MAX_VARIATIONS - (message.variations?.length ?? 0);

  function fullText(): string {
    return current.subject
      ? `Subject: ${current.subject}\n\n${current.body}`
      : current.body;
  }

  async function copyToClipboard() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(fullText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareNative() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await Share.share({
        message: fullText(),
        title: current.subject ?? 'Outreach message',
      });
      if (result.action === Share.sharedAction) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch { /* cancelled */ }
  }

  async function submitRegeneration() {
    if (!instruction.trim() || regenerating || remaining <= 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRegenerating(true);
    try {
      await onRegenerate(message.id, instruction.trim());
      setInstruction('');
      setShowRegenerate(false);
      // Show the new version (last index)
      setVariationIdx(allVersions.length); // after the parent adds the new variation
    } finally {
      setRegenerating(false);
    }
  }

  function toggleSent() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onMarkSent(message.id, !isSent);
  }

  return (
    <Card style={isSent ? [styles.card, styles.sentCard] : styles.card}>
      {/* Header: meta badges + icon actions */}
      <View style={styles.header}>
        {message.sendTiming && (
          <Badge label={message.sendTiming} variant="primary" />
        )}
        {message.recipientPlaceholder && (
          <Badge label={message.recipientPlaceholder} variant="muted" />
        )}
        <View style={styles.iconActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share message"
            onPress={() => { void shareNative(); }}
            style={styles.iconButton}
          >
            <Share2 size={iconSize.sm} color={c.mutedForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Copied' : 'Copy message'}
            onPress={() => { void copyToClipboard(); }}
            style={styles.iconButton}
          >
            {copied
              ? <Check size={iconSize.sm} color={c.success} />
              : <Copy  size={iconSize.sm} color={c.mutedForeground} />}
          </Pressable>
        </View>
      </View>

      {/* Personalisation hook (batch only) */}
      {message.personalisationHook && (
        <Text variant="caption" color={c.secondary} style={{ marginTop: spacing[2] }}>
          Personalise with: {message.personalisationHook}
        </Text>
      )}

      {/* Subject (email only) */}
      {current.subject && (
        <>
          <Text variant="overline" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
            Subject
          </Text>
          <Text variant="label" style={{ marginTop: spacing[0.5] }}>
            {current.subject}
          </Text>
        </>
      )}

      {/* Body */}
      <Text variant="body" style={{ marginTop: spacing[3], lineHeight: 22 }}>
        {current.body}
      </Text>

      {/* Escalation note (sequence only) */}
      {message.escalationNote && (
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[3], fontStyle: 'italic' }}>
          {message.escalationNote}
        </Text>
      )}

      {/* Annotation */}
      <View style={[styles.annotation, { backgroundColor: c.muted }]}>
        <Text variant="overline" color={c.mutedForeground}>Why this works</Text>
        <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[1] }}>
          {message.annotation}
        </Text>
      </View>

      {/* Variation picker when multiple versions exist */}
      {allVersions.length > 1 && (
        <View style={styles.versionRow}>
          {allVersions.map((_, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Show version ${i + 1} of ${allVersions.length}`}
              onPress={() => setVariationIdx(i)}
              style={[
                styles.versionChip,
                {
                  backgroundColor: i === variationIdx ? c.primary : c.muted,
                },
              ]}
            >
              <Text
                variant="caption"
                color={i === variationIdx ? c.primaryForeground : c.mutedForeground}
              >
                {i === 0 ? 'Original' : `v${i}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Coach handoff */}
      {message.suggestedTool === 'conversation_coach' && onCoachHandoff && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Prepare for this conversation with the Conversation Coach"
          onPress={() => onCoachHandoff(message)}
          style={[styles.coachHandoff, { borderColor: c.primary }]}
        >
          <MessageSquare size={iconSize.sm} color={c.primary} />
          <Text variant="caption" color={c.primary} style={{ flex: 1 }}>
            Prepare for this conversation
          </Text>
          <ArrowRight size={iconSize.sm} color={c.primary} />
        </Pressable>
      )}

      {/* Action row: regenerate + mark-sent */}
      <View style={styles.actionRow}>
        <Button
          title={
            remaining <= 0
              ? 'No regenerations left'
              : `Try a different angle · ${remaining} left`
          }
          onPress={() => setShowRegenerate(v => !v)}
          variant="ghost"
          size="sm"
          disabled={remaining <= 0}
        />
        <Button
          title={isSent ? '✓ Sent' : 'Mark as sent'}
          onPress={toggleSent}
          variant={isSent ? 'secondary' : 'primary'}
          size="sm"
        />
      </View>

      {/* Regenerate form */}
      {showRegenerate && remaining > 0 && (
        <View style={styles.regenerateForm}>
          <Text variant="overline" color={c.mutedForeground}>
            What would make it better?
          </Text>
          <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border, marginTop: spacing[2] }]}>
            <RNTextInput
              value={instruction}
              onChangeText={setInstruction}
              placeholder='e.g. "shorter", "more casual", "lead with the outcome"'
              placeholderTextColor={c.placeholder}
              multiline
              maxLength={1000}
              style={[styles.input, { color: c.foreground }]}
            />
          </View>
          <Button
            title={regenerating ? 'Rewriting…' : 'Rewrite'}
            onPress={() => { void submitRegeneration(); }}
            loading={regenerating}
            disabled={!instruction.trim() || regenerating}
            size="sm"
            fullWidth
            style={{ marginTop: spacing[2] }}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[0.5],
  },
  sentCard: {
    opacity: 0.75,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  iconActions: {
    flexDirection: 'row',
    gap: spacing[1],
    marginLeft: 'auto',
  },
  iconButton: {
    padding: spacing[2],
  },
  annotation: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
  },
  versionRow: {
    flexDirection: 'row',
    gap: spacing[1.5],
    marginTop: spacing[3],
  },
  versionChip: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radius.full,
  },
  coachHandoff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  regenerateForm: {
    marginTop: spacing[3],
  },
  textArea: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[3],
  },
  input: {
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.leading.relaxed,
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
