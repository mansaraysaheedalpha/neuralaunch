// src/components/ui/ScrollToBottomButton.tsx
//
// Floating action button anchored above the chat input. Appears when the
// user has scrolled up far enough to miss new messages arriving at the
// bottom; tapping it returns them to the latest message.
//
// Presentational only — the parent owns scroll state (see
// `@/hooks/useScrollToBottom`) and passes `visible` + `onPress` in.

import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ChevronDown } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { animation, radius } from '@/constants/theme';

interface Props {
  visible: boolean;
  onPress: () => void;
  /** Distance from the bottom of the parent (above the chat input). Defaults to 80pt. */
  bottom?: number;
  style?: ViewStyle;
}

export function ScrollToBottomButton({ visible, onPress, bottom = 80, style }: Props) {
  const { colors: c, shadows: s } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: animation.fast,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: visible ? 1 : 0.8,
        useNativeDriver: true,
        friction: 7,
        tension: 160,
      }),
    ]).start();
  }, [visible, opacity, scale]);

  function handlePress() {
    void Haptics.selectionAsync();
    onPress();
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.fab,
        s.md,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          bottom,
          opacity,
          transform: [{ scale }],
        },
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Scroll to latest message"
        style={styles.pressable}
      >
        <ChevronDown size={20} color={c.foreground} strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
