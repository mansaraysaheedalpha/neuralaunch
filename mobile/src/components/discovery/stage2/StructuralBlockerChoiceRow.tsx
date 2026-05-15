// src/components/discovery/stage2/StructuralBlockerChoiceRow.tsx
//
// One tappable choice row inside the StructuralBlockerCard. Extracted
// to its own file so the parent card stays under CLAUDE.md's
// 200-line React-component cap; the row is also reusable if a future
// surface needs a similar selectable-option pattern.

import { View, Pressable, StyleSheet } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import type { StructuralBlockerChoice } from '@/lib/ideation-types';
import { spacing, iconSize, radius } from '@/constants/theme';

export interface StructuralBlockerChoiceOption {
  choice:      StructuralBlockerChoice;
  label:       string;
  description: string;
}

interface Props {
  option:   StructuralBlockerChoiceOption;
  selected: boolean;
  disabled: boolean;
  onPick:   () => void;
}

export function StructuralBlockerChoiceRow({
  option,
  selected,
  disabled,
  onPick,
}: Props) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPick}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor:     selected ? c.secondary : c.border,
          backgroundColor: selected ? c.secondaryAlpha20 : c.background,
        },
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View style={styles.heading}>
        {selected && <ArrowRight size={iconSize.xs} color={c.secondary} />}
        <Text variant="body" color={c.foreground} weight="semibold">
          {option.label}
        </Text>
      </View>
      <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
        {option.description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: spacing[3],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
});
