// src/components/ui/Button.tsx
//
// Premium button with haptic feedback, loading state, and three
// visual variants that match the web app's design language.

import {
  Pressable,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { useTheme } from '@/hooks/useTheme';
import { radius, spacing, typography, animation } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
  style,
}: Props) {
  const { colors: c } = useTheme();
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const containerStyle = getContainerStyle(variant, size, c, fullWidth);
  const textStyle = getTextStyle(variant, size, c);

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        containerStyle,
        pressed && !isDisabled && { opacity: 0.88 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? c.primaryForeground : c.primary}
        />
      ) : (
        <>
          {icon}
          <Text
            variant="label"
            style={[textStyle, icon ? { marginLeft: spacing[2] } : undefined]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function getContainerStyle(
  variant: Variant,
  size: Size,
  c: ReturnType<typeof useTheme>['colors'],
  fullWidth: boolean,
): ViewStyle {
  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    ...(fullWidth && { width: '100%' }),
  };

  const sizeStyles: Record<Size, ViewStyle> = {
    sm: { paddingHorizontal: spacing[3], paddingVertical: spacing[1.5], minHeight: 32 },
    md: { paddingHorizontal: spacing[4], paddingVertical: spacing[2.5], minHeight: 44 },
    lg: { paddingHorizontal: spacing[6], paddingVertical: spacing[3.5], minHeight: 52 },
  };

  const variantStyles: Record<Variant, ViewStyle> = {
    primary:   { backgroundColor: c.primary },
    secondary: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
    ghost:     { backgroundColor: 'transparent' },
  };

  return { ...base, ...sizeStyles[size], ...variantStyles[variant] };
}

function getTextStyle(
  variant: Variant,
  size: Size,
  c: ReturnType<typeof useTheme>['colors'],
): TextStyle {
  const sizeMap: Record<Size, number> = {
    sm: typography.size.xs,
    md: typography.size.sm,
    lg: typography.size.base,
  };

  return {
    fontSize: sizeMap[size],
    fontWeight: typography.weight.semibold,
    color: variant === 'primary' ? c.primaryForeground
         : variant === 'ghost'   ? c.primary
         :                         c.foreground,
  };
}
