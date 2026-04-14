// src/components/roadmap/TaskStatusPicker.tsx
//
// Inline dropdown that lets the founder change a task's status by
// tapping one of four options. Rendered below the status Badge when
// the badge is tapped. Owns no state of its own — the parent controls
// open/closed and selected value.

import { View, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Badge } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import type { TaskStatus } from '@/hooks/useRoadmap';
import { STATUS_OPTIONS, STATUS_VARIANTS } from './task-constants';

interface Props {
  value:    TaskStatus;
  onChange: (status: TaskStatus) => void;
}

export function TaskStatusPicker({ value, onChange }: Props) {
  const { colors: c } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: c.card, borderColor: c.border }]}>
      {STATUS_OPTIONS.map(opt => (
        <Pressable
          key={opt.value}
          accessibilityRole="button"
          accessibilityLabel={`Set status to ${opt.label}`}
          accessibilityState={{ selected: opt.value === value }}
          onPress={() => onChange(opt.value)}
          style={[
            styles.option,
            opt.value === value && { backgroundColor: c.primaryAlpha5 },
          ]}
        >
          <Badge label={opt.label} variant={STATUS_VARIANTS[opt.value]} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
});
