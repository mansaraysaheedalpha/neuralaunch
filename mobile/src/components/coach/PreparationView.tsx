// src/components/coach/PreparationView.tsx
//
// Renders the preparation package: opening script, key asks,
// objection handling, fallback positions, post-conversation checklist.
// Each section is collapsible. The opening script has a copy button.

import { View, StyleSheet, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Button, CollapsibleSection } from '@/components/ui';
import { spacing } from '@/constants/theme';

interface PreparationPackage {
  openingScript: string;
  keyAsks: Array<{ ask: string; whyItMatters: string }>;
  objections: Array<{ objection: string; response: string; groundedIn: string }>;
  fallbackPositions: Array<{ trigger: string; fallback: string }>;
  postConversationChecklist: Array<{ condition: string; action: string }>;
}

interface Props {
  preparation: PreparationPackage | null;
  loading: boolean;
  channel: string;
  onStartRolePlay: () => void;
}

export function PreparationView({ preparation, loading, channel, onStartRolePlay }: Props) {
  const { colors: c } = useTheme();
  const [copied, setCopied] = useState(false);

  if (loading || !preparation) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
          Preparing your conversation package…
        </Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
          Researching context, building your script, and preparing objection responses.
        </Text>
      </View>
    );
  }

  async function handleCopyScript() {
    if (!preparation) return;
    await Clipboard.setStringAsync(preparation.openingScript);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View style={styles.container}>
      {/* Opening script */}
      <CollapsibleSection label={`Opening Script (${channel})`}>
        <Card>
          <Text variant="body">{preparation.openingScript}</Text>
          <Button
            title={copied ? '✓ Copied' : 'Copy to clipboard'}
            onPress={() => { void handleCopyScript(); }}
            variant="ghost"
            size="sm"
            style={{ marginTop: spacing[3], alignSelf: 'flex-start' }}
          />
        </Card>
      </CollapsibleSection>

      {/* Key asks */}
      <CollapsibleSection label="Key Asks">
        <View style={{ gap: spacing[2] }}>
          {preparation.keyAsks.map((ask, i) => (
            <Card key={i}>
              <Text variant="label">{ask.ask}</Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                {ask.whyItMatters}
              </Text>
            </Card>
          ))}
        </View>
      </CollapsibleSection>

      {/* Objection handling */}
      <CollapsibleSection label="Objection Handling">
        <View style={{ gap: spacing[3] }}>
          {preparation.objections.map((obj, i) => (
            <Card key={i}>
              <Text variant="label" color={c.destructive}>{obj.objection}</Text>
              <Text variant="body" style={{ marginTop: spacing[2] }}>{obj.response}</Text>
              <Text variant="caption" color={c.primary} style={{ marginTop: spacing[1], fontStyle: 'italic' }}>
                Grounded in: {obj.groundedIn}
              </Text>
            </Card>
          ))}
        </View>
      </CollapsibleSection>

      {/* Fallback positions */}
      <CollapsibleSection label="Fallback Positions">
        <View style={{ gap: spacing[2] }}>
          {preparation.fallbackPositions.map((fb, i) => (
            <Card key={i}>
              <Text variant="caption" color={c.mutedForeground}>{fb.trigger}</Text>
              <Text variant="body" style={{ marginTop: spacing[1] }}>{fb.fallback}</Text>
            </Card>
          ))}
        </View>
      </CollapsibleSection>

      {/* Post-conversation checklist */}
      <CollapsibleSection label="After the Conversation">
        <View style={{ gap: spacing[2] }}>
          {preparation.postConversationChecklist.map((item, i) => (
            <View key={i} style={styles.checklistRow}>
              <Text variant="caption" color={c.mutedForeground}>If {item.condition}:</Text>
              <Text variant="body">{item.action}</Text>
            </View>
          ))}
        </View>
      </CollapsibleSection>

      {/* Rehearse CTA */}
      <View style={styles.rehearseCta}>
        <Text variant="caption" color={c.mutedForeground} style={{ marginBottom: spacing[2] }}>
          Ready to practise? The AI will play the other party so you
          can rehearse before the real conversation.
        </Text>
        <Button
          title="Start Rehearsal"
          onPress={onStartRolePlay}
          size="lg"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[4],
    padding: spacing[5],
    paddingBottom: spacing[12],
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[8],
  },
  checklistRow: {
    gap: spacing[0.5],
  },
  rehearseCta: {
    marginTop: spacing[4],
  },
});
