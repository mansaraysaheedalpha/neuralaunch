// src/components/tools/ToolSessionHistoryButton.tsx
//
// Header button that opens a BottomSheet listing the founder's recent
// standalone sessions for one of the four tools (Coach, Composer,
// Research, Packager). Tapping a row fires `onSelect(sessionId)`
// which the parent tool screen uses to fetch the session detail and
// re-hydrate its state machine.
//
// Web equivalent: the sidebars introduced by commits 58c2761 and
// 622c213 (`CoachHistoryPanel`, `ComposerHistoryPanel`,
// `ResearchHistoryPanel`, `PackagerHistoryPanel`). Mobile uses a
// BottomSheet instead of a sidebar because mobile's form factor rules
// out the side-by-side layout; the list + tap + restore UX matches.
//
// Kept generic via row shape — each tool supplies its own rows
// (id + title + subtitle + timestamp) so this primitive doesn't have
// to know anything about tool-specific fields.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { History } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, BottomSheet } from '@/components/ui';
import { spacing, radius, iconSize } from '@/constants/theme';

export interface ToolSessionRow {
  id:        string;
  title:     string;
  subtitle?: string;
  /** ISO-8601 — the row displays a short relative hint derived from this. */
  updatedAt: string;
}

interface Props {
  rows:     ToolSessionRow[] | null;   // null = still loading; [] = no history
  title:    string;                    // BottomSheet heading, e.g. "Recent packages"
  onSelect: (sessionId: string) => void;
  /** True while a restore is in flight — disables row taps. */
  restoring?: boolean;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1)  return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ToolSessionHistoryButton({ rows, title, onSelect, restoring }: Props) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);

  // Hide the button entirely when there are no sessions yet — no noise
  // for first-time users.
  if (!rows || rows.length === 0) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${rows.length} available`}
        onPress={() => {
          void Haptics.selectionAsync();
          setOpen(true);
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.headerButton,
          { borderColor: c.border, backgroundColor: c.card, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <History size={iconSize.xs} color={c.mutedForeground} />
        <Text variant="caption" color={c.mutedForeground} style={{ fontWeight: '600' }}>
          {rows.length} recent
        </Text>
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={styles.list}>
          {rows.map(row => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              accessibilityLabel={`Restore ${row.title}`}
              disabled={restoring}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setOpen(false);
                onSelect(row.id);
              }}
              style={({ pressed }) => [
                styles.row,
                { borderColor: c.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>{row.title}</Text>
                {row.subtitle && (
                  <Text variant="caption" color={c.mutedForeground} numberOfLines={1} style={{ marginTop: spacing[0.5] }}>
                    {row.subtitle}
                  </Text>
                )}
              </View>
              <Text variant="caption" color={c.mutedForeground}>
                {formatRelative(row.updatedAt)}
              </Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1.5],
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
  },
  list: {
    gap: spacing[2],
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
});
