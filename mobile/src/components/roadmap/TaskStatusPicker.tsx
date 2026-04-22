// src/components/roadmap/TaskStatusPicker.tsx
//
// Status picker — presents the four status options inside a BottomSheet
// anchored to the thumb zone. Replaces the prior inline dropdown, which
// caused a layout shift on long task cards and wasn't the platform
// convention. Parent owns open/closed state and the current value.

import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Badge, BottomSheet, Text } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import type { TaskStatus } from '@/hooks/useRoadmap';
import { STATUS_OPTIONS, STATUS_VARIANTS } from './task-constants';

interface Props {
  visible: boolean;
  value:   TaskStatus;
  onChange: (status: TaskStatus) => void;
  onClose:  () => void;
}

export function TaskStatusPicker({ visible, value, onChange, onClose }: Props) {
  const { colors: c } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Set task status">
      <View style={styles.list}>
        {STATUS_OPTIONS.map(opt => {
          const isSelected = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              accessibilityLabel={`Set status to ${opt.label}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onChange(opt.value)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: isSelected
                    ? c.primaryAlpha10
                    : pressed
                      ? c.muted
                      : 'transparent',
                  borderColor: isSelected ? c.primary : c.border,
                },
              ]}
            >
              <Badge label={opt.label} variant={STATUS_VARIANTS[opt.value]} />
              {isSelected && (
                <Text variant="caption" color={c.primary}>
                  Current
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 52,
  },
});
