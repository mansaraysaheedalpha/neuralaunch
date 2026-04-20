// src/components/research/FindingCard.tsx
//
// One research finding — business / person / datapoint / regulation.
// Adapts to the finding type by showing whichever contact info and
// source link the backend returned. Copy-contact chip streamlines the
// "found someone, now I want to message them" flow.

import { useState } from 'react';
import { View, Pressable, Linking, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Check, ExternalLink } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Badge } from '@/components/ui';
import { spacing, radius, iconSize } from '@/constants/theme';
import { CONFIDENCE_VARIANT, type Finding } from './types';

interface Props {
  finding: Finding;
}

export function FindingCard({ finding: f }: Props) {
  const { colors: c } = useTheme();
  const [copied, setCopied] = useState(false);

  const contactStrings: string[] = [];
  if (f.contactInfo?.website)         contactStrings.push(f.contactInfo.website);
  if (f.contactInfo?.phone)           contactStrings.push(f.contactInfo.phone);
  if (f.contactInfo?.email)           contactStrings.push(f.contactInfo.email);
  if (f.contactInfo?.physicalAddress) contactStrings.push(f.contactInfo.physicalAddress);

  async function copyContacts() {
    if (contactStrings.length === 0) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(contactStrings.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <View style={styles.findingHeader}>
        <Badge label={f.type} variant="muted" />
        <Badge label={f.confidence} variant={CONFIDENCE_VARIANT[f.confidence]} />
      </View>
      <Text variant="label" style={{ marginTop: spacing[2] }}>{f.title}</Text>
      {f.location && (
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
          {f.location}
        </Text>
      )}
      <Text variant="body" style={{ marginTop: spacing[2] }}>{f.description}</Text>

      {contactStrings.length > 0 && (
        <View style={[styles.contactBox, { backgroundColor: c.muted }]}>
          {f.contactInfo?.website && (
            <Pressable onPress={() => void Linking.openURL(f.contactInfo!.website!)}>
              <Text variant="caption" color={c.primary}>{f.contactInfo.website}</Text>
            </Pressable>
          )}
          {f.contactInfo?.phone && (
            <Text variant="caption" color={c.foreground}>{f.contactInfo.phone}</Text>
          )}
          {f.contactInfo?.email && (
            <Text variant="caption" color={c.foreground}>{f.contactInfo.email}</Text>
          )}
          {f.contactInfo?.physicalAddress && (
            <Text variant="caption" color={c.foreground}>{f.contactInfo.physicalAddress}</Text>
          )}
          {f.contactInfo?.socialMedia?.map((s, i) => (
            <Pressable key={i} onPress={() => void Linking.openURL(s.url)}>
              <Text variant="caption" color={c.primary}>{s.platform}: {s.handle}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Copied contact info' : 'Copy contact info'}
            onPress={() => { void copyContacts(); }}
            style={styles.copyChip}
          >
            {copied ? <Check size={iconSize.xs} color={c.success} /> : <Copy size={iconSize.xs} color={c.mutedForeground} />}
            <Text variant="caption" color={c.mutedForeground}>
              {copied ? 'Copied' : 'Copy contact'}
            </Text>
          </Pressable>
        </View>
      )}

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open source"
        onPress={() => void Linking.openURL(f.sourceUrl)}
        style={styles.sourceLink}
      >
        <ExternalLink size={iconSize.xs} color={c.primary} />
        <Text variant="caption" color={c.primary}>Source</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  findingHeader: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  contactBox: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    gap: spacing[1],
  },
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[2],
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[3],
  },
});
