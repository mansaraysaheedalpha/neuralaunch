// src/components/ui/Card.tsx
//
// Content card — the primary container for grouped information.
// Matches the web app's rounded-xl border border-border bg-card pattern.

import { View, type ViewStyle, type StyleProp, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radius, spacing } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'muted';
  /** Remove internal padding — for cards that manage their own layout */
  noPadding?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  variant = 'default',
  noPadding = false,
  style,
}: Props) {
  const { colors: c, shadows: s } = useTheme();

  const variantStyles: Record<string, ViewStyle> = {
    default: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
    },
    primary: {
      backgroundColor: c.primaryAlpha5,
      borderColor: c.primaryAlpha20,
      borderWidth: 1,
    },
    muted: {
      backgroundColor: c.muted,
      borderColor: 'transparent',
      borderWidth: 0,
    },
  };

  return (
    <View
      style={[
        styles.base,
        variantStyles[variant],
        !noPadding && styles.padding,
        s.sm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  padding: {
    padding: spacing[4],
  },
});
