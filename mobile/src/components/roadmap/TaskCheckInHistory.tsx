// src/components/roadmap/TaskCheckInHistory.tsx
//
// Collapsible transcript of a task's prior check-ins. Shows category,
// round, the founder's free-text update, and the agent's response.
// Entirely presentational — caller owns the open/closed state.

import { View, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Badge } from '@/components/ui';
import { radius, spacing, iconSize } from '@/constants/theme';
import type { CheckInEntry } from '@/hooks/useRoadmap';

interface Props {
  entries: CheckInEntry[];
  open:    boolean;
  onToggle: () => void;
}

export function TaskCheckInHistory({ entries, open, onToggle }: Props) {
  const { colors: c } = useTheme();

  if (entries.length === 0) return null;

  function handleToggle() {
    void Haptics.selectionAsync();
    onToggle();
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide check-in history' : 'Show check-in history'}
        onPress={handleToggle}
        style={styles.toggle}
      >
        {open
          ? <ChevronUp   size={iconSize.sm} color={c.primary} />
          : <ChevronDown size={iconSize.sm} color={c.primary} />}
        <Text variant="caption" color={c.primary}>
          {open ? 'Hide' : 'Show'} check-in history ({entries.length})
        </Text>
      </Pressable>

      {open && (
        <View style={styles.list}>
          {entries.map((entry, i) => (
            <View
              key={entry.id ?? i}
              style={[styles.entry, { borderLeftColor: c.primaryAlpha20 }]}
            >
              <View style={styles.header}>
                <Badge label={entry.category} variant="muted" />
                <Text variant="caption" color={c.mutedForeground}>
                  Round {entry.round}
                </Text>
              </View>
              <Text variant="caption" style={{ marginTop: spacing[1] }}>
                {entry.freeText}
              </Text>
              <View style={[styles.agentResponse, { backgroundColor: c.muted }]}>
                <Text variant="caption" color={c.foreground}>
                  {entry.agentResponse}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[1],
  },
  list: {
    gap: spacing[3],
    marginTop: spacing[2],
  },
  entry: {
    borderLeftWidth: 2,
    paddingLeft: spacing[3],
  },
  header: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
  },
  agentResponse: {
    marginTop: spacing[2],
    padding: spacing[3],
    borderRadius: radius.lg,
  },
});
