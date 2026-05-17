// src/components/validation/DistributionTracker.tsx
//
// Distribution checklist + copy-message UX for a LIVE validation page.
// Renders the per-channel cards (channel name, audience reason,
// expected yield, suggested message, copy-message button) and a
// completion toggle per channel.
//
// Extracted from /validation/[pageId].tsx during the self-review
// refactor so the detail screen stays under CLAUDE.md's 200-line
// React-component cap.

import { View, Pressable, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Separator } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

export interface DistributionChannel {
  channel:        string;
  audienceReason: string;
  expectedYield:  string;
  message:        string;
}

interface Props {
  distributionBrief:  DistributionChannel[];
  channelsCompleted:  string[];
  onToggleChannel:    (channel: string, completed: boolean) => Promise<void> | void;
}

export function DistributionTracker({
  distributionBrief,
  channelsCompleted,
  onToggleChannel,
}: Props) {
  const { colors: c } = useTheme();
  if (distributionBrief.length === 0) return null;

  return (
    <>
      <Separator />
      <Text variant="title">Where to share it</Text>
      <Text variant="caption" color={c.mutedForeground} style={{ marginBottom: spacing[3] }}>
        {channelsCompleted.length} of {distributionBrief.length} shared
      </Text>

      <View style={styles.list}>
        {distributionBrief.map((ch, i) => {
          const isDone = channelsCompleted.includes(ch.channel);
          return (
            <Card
              key={`${ch.channel}-${i}`}
              variant={isDone ? 'primary' : 'default'}
              style={styles.card}
            >
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text variant="label">{ch.channel}</Text>
                  <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
                    {ch.audienceReason}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${ch.channel} — ${isDone ? 'shared' : 'not shared'}`}
                  accessibilityState={{ checked: isDone }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => { void onToggleChannel(ch.channel, !isDone); }}
                  style={[
                    styles.checkbox,
                    {
                      borderColor:     isDone ? c.primary : c.border,
                      backgroundColor: isDone ? c.primary : 'transparent',
                    },
                  ]}
                >
                  {isDone && <Check size={14} color={c.primaryForeground} strokeWidth={3} />}
                </Pressable>
              </View>

              <Text variant="overline" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
                Expected yield
              </Text>
              <Text variant="caption">{ch.expectedYield}</Text>

              <View style={[styles.messageBox, { backgroundColor: c.muted, borderColor: c.border }]}>
                <Text variant="overline" color={c.mutedForeground}>Message to send</Text>
                <Text variant="caption" style={{ marginTop: spacing[1] }}>{ch.message}</Text>
                <Pressable
                  onPress={async () => {
                    await Clipboard.setStringAsync(ch.message);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                  style={{ marginTop: spacing[2] }}
                >
                  <Text variant="label" color={c.primary}>Copy message</Text>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing[3],
  },
  card: {
    gap: spacing[1],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBox: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
