// src/components/ui/TextInput.tsx
//
// Styled text input matching the web app's input pattern.

import {
  TextInput as RNTextInput,
  View,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radius, spacing, typography } from '@/constants/theme';
import { Text } from './Text';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function TextInput({
  label,
  error,
  containerStyle,
  style,
  ...props
}: Props) {
  const { colors: c } = useTheme();

  return (
    <View style={containerStyle}>
      {label && (
        <Text variant="label" style={styles.label}>{label}</Text>
      )}
      <RNTextInput
        placeholderTextColor={c.placeholder}
        style={[
          styles.input,
          {
            backgroundColor: c.card,
            borderColor: error ? c.destructive : c.border,
            color: c.foreground,
          },
          style,
        ]}
        {...props}
      />
      {error && (
        <Text variant="caption" color={c.destructive} style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing[1.5],
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2.5],
    fontSize: typography.size.base,
    lineHeight: typography.size.base * typography.leading.normal,
    minHeight: 44,
  },
  error: {
    marginTop: spacing[1],
  },
});
