// src/components/ui/Badge.tsx
//
// Status badge — used for recommendation status, roadmap task state,
// validation signal strength, etc.

import { View, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radius, spacing, typography } from '@/constants/theme';
import { Text } from './Text';

type Variant = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

interface Props {
  label: string;
  variant?: Variant;
  style?: ViewStyle;
}

export function Badge({ label, variant = 'default', style }: Props) {
  const { colors: c } = useTheme();

  const variantStyles: Record<Variant, { bg: string; fg: string }> = {
    default:     { bg: c.muted,            fg: c.mutedForeground },
    primary:     { bg: c.primaryAlpha10,   fg: c.primary },
    success:     { bg: c.successMuted,     fg: c.success },
    warning:     { bg: c.warningMuted,     fg: c.warning },
    destructive: { bg: c.destructiveMuted, fg: c.destructive },
    muted:       { bg: c.muted,            fg: c.mutedForeground },
  };

  const v = variantStyles[variant];

  return (
    <View style={[styles.badge, { backgroundColor: v.bg }, style]}>
      <Text
        variant="overline"
        style={{ color: v.fg, fontSize: typography.size['2xs'] }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
});
