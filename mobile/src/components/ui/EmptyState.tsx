// src/components/ui/EmptyState.tsx
//
// Consistent empty state for list screens with no data yet.

import { View, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { Button } from './Button';
import { spacing, iconSize } from '@/constants/theme';

interface Props {
  icon?:    LucideIcon;
  title:    string;
  message:  string;
  actionLabel?: string;
  onAction?:    () => void;
}

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction }: Props) {
  const { colors: c } = useTheme();

  return (
    <View style={styles.container}>
      {Icon && <Icon size={iconSize.xl} color={c.mutedForeground} style={{ opacity: 0.5 }} />}
      <Text variant="title" align="center" style={{ marginTop: Icon ? spacing[4] : 0 }}>
        {title}
      </Text>
      <Text
        variant="body"
        color={c.mutedForeground}
        align="center"
        style={{ marginTop: spacing[2], maxWidth: 320 }}
      >
        {message}
      </Text>
      {actionLabel && onAction && (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant="primary"
          size="md"
          style={{ marginTop: spacing[5] }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[8],
  },
});
