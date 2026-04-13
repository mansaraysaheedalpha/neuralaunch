// src/components/ui/Text.tsx
//
// Typography primitives that enforce the design system. Every text
// element in the app uses one of these — never raw <Text>.

import { Text as RNText, type TextProps, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { typography } from '@/constants/theme';

interface Props extends TextProps {
  variant?: 'heading' | 'title' | 'body' | 'label' | 'caption' | 'overline';
  color?: string;
  weight?: keyof typeof typography.weight;
  align?: 'left' | 'center' | 'right';
}

export function Text({
  variant = 'body',
  color,
  weight,
  align,
  style,
  ...props
}: Props) {
  const { colors: c } = useTheme();

  const variantStyles = styles[variant];
  const resolvedColor = color ?? (variant === 'caption' || variant === 'overline'
    ? c.mutedForeground
    : c.foreground);

  return (
    <RNText
      style={[
        variantStyles,
        { color: resolvedColor },
        weight && { fontWeight: typography.weight[weight] },
        align && { textAlign: align },
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold,
    lineHeight: typography.size['2xl'] * typography.leading.tight,
    letterSpacing: typography.tracking.tight,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.size.lg * typography.leading.snug,
  },
  body: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.normal,
    lineHeight: typography.size.base * typography.leading.relaxed,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    lineHeight: typography.size.sm * typography.leading.normal,
  },
  caption: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.normal,
    lineHeight: typography.size.xs * typography.leading.normal,
  },
  overline: {
    fontSize: typography.size['2xs'],
    fontWeight: typography.weight.semibold,
    lineHeight: typography.size['2xs'] * typography.leading.normal,
    letterSpacing: typography.tracking.widest,
    textTransform: 'uppercase',
  },
});
