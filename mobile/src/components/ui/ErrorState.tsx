// src/components/ui/ErrorState.tsx
//
// Consistent error state for every screen. Icon, message, retry action.

import { View, StyleSheet } from 'react-native';
import { AlertCircle, WifiOff, Lock } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { Button } from './Button';
import { spacing } from '@/constants/theme';

type ErrorKind = 'generic' | 'network' | 'auth';

interface Props {
  kind?:    ErrorKind;
  title?:   string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

const PRESETS: Record<ErrorKind, { title: string; message: string }> = {
  generic: {
    title:   'Something went wrong',
    message: 'We could not load this right now. Please try again.',
  },
  network: {
    title:   'Connection lost',
    message: 'Check your internet connection and try again.',
  },
  auth: {
    title:   'Session expired',
    message: 'Please sign in again to continue.',
  },
};

export function ErrorState({
  kind = 'generic',
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
}: Props) {
  const { colors: c } = useTheme();
  const preset = PRESETS[kind];
  const Icon = kind === 'network' ? WifiOff : kind === 'auth' ? Lock : AlertCircle;

  return (
    <View style={styles.container}>
      <Icon size={40} color={c.mutedForeground} />
      <Text variant="title" align="center" style={{ marginTop: spacing[4] }}>
        {title ?? preset.title}
      </Text>
      <Text variant="body" color={c.mutedForeground} align="center" style={{ marginTop: spacing[2] }}>
        {message ?? preset.message}
      </Text>
      {onRetry && (
        <Button
          title={retryLabel}
          onPress={onRetry}
          variant="secondary"
          size="md"
          style={{ marginTop: spacing[5] }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[8],
  },
});
