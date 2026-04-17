// src/components/ui/CollapsibleSection.tsx
//
// Collapsible section — plain RN Animated for Expo Go compatibility.

import { useState, useCallback, useRef } from 'react';
import { Pressable, View, Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { spacing } from '@/constants/theme';

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
  const rotation = useRef(new Animated.Value(defaultOpen ? 0 : -90)).current;

  const toggle = useCallback(() => {
    void Haptics.selectionAsync();
    const next = !open;
    setOpen(next);
    Animated.timing(rotation, {
      toValue: next ? 0 : -90,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [open, rotation]);

  const chevronStyle = {
    transform: [{
      rotate: rotation.interpolate({
        inputRange: [-90, 0],
        outputRange: ['-90deg', '0deg'],
      }),
    }],
  };

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
    paddingVertical: spacing[3],
    minHeight: 44,
  },
  content: {
    paddingBottom: spacing[2],
  },
});
