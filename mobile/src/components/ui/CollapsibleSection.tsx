// src/components/ui/CollapsibleSection.tsx
//
// Collapsible section with animated expand/collapse — used for the
// recommendation reveal sections. Matches the web app's Section
// component pattern with ChevronDown rotation.

import { useState, useCallback } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { spacing, animation } from '@/constants/theme';

interface Props {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  label,
  children,
  defaultOpen = true,
}: Props) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const rotation = useSharedValue(defaultOpen ? 0 : -90);

  const toggle = useCallback(() => {
    void Haptics.selectionAsync();
    const next = !open;
    setOpen(next);
    rotation.value = withTiming(next ? 0 : -90, { duration: animation.fast });
  }, [open, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View>
      <Pressable onPress={toggle} style={styles.header}>
        <Text variant="overline" color={c.mutedForeground}>
          {label}
        </Text>
        <Animated.View style={chevronStyle}>
          <Text variant="caption" color={c.mutedForeground}>▼</Text>
        </Animated.View>
      </Pressable>
      {open && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  content: {
    paddingBottom: spacing[2],
  },
});
