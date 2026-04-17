// src/components/ui/CollapsibleSection.tsx
//
// Collapsible section — plain RN Animated for Expo Go compatibility.

import { useState, useCallback, useRef } from 'react';
import { Pressable, View, Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronDown } from 'lucide-react-native';
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
  // progress: 0 = collapsed (chevron points right at -90deg), 1 = open (0deg)
  const progress = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = useCallback(() => {
    void Haptics.selectionAsync();
    const next = !open;
    setOpen(next);
    Animated.timing(progress, {
      toValue: next ? 1 : 0,
      duration: animation.fast,
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const chevronStyle = {
    transform: [{
      rotate: progress.interpolate({
        inputRange: [0, 1],
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
          <ChevronDown size={16} color={c.mutedForeground} strokeWidth={2} />
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
