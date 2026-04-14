// src/components/roadmap/TaskMeta.tsx
//
// Time + success-criteria meta row shown inside a TaskCard.
// Purely presentational — no state, no callbacks.

import { View, StyleSheet } from 'react-native';
import { Clock, Target } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import { iconSize, spacing } from '@/constants/theme';

interface Props {
  timeEstimate:    string;
  successCriteria: string;
}

export function TaskMeta({ timeEstimate, successCriteria }: Props) {
  const { colors: c } = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.item}>
        <View style={styles.label}>
          <Clock size={iconSize.xs} color={c.mutedForeground} />
          <Text variant="overline" color={c.mutedForeground}>Time</Text>
        </View>
        <Text variant="caption">{timeEstimate}</Text>
      </View>
      <View style={[styles.item, { flex: 2 }]}>
        <View style={styles.label}>
          <Target size={iconSize.xs} color={c.mutedForeground} />
          <Text variant="overline" color={c.mutedForeground}>Done when</Text>
        </View>
        <Text variant="caption">{successCriteria}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  item: {
    flex: 1,
    gap: spacing[0.5],
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
});
