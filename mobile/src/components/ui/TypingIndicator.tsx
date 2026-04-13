// src/components/ui/TypingIndicator.tsx
//
// Three-dot animated typing indicator shown while the AI is
// generating a response. Smooth, subtle, premium.

import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { radius, spacing, animation } from '@/constants/theme';

export function TypingIndicator() {
  const { colors: c } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: c.muted }]}>
      {[0, 1, 2].map(i => (
        <Dot key={i} delay={i * 150} color={c.mutedForeground} />
      ))}
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 }),
        ),
        -1,
        true,
      ),
    ),
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color },
        animStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1.5],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.xl,
    borderBottomLeftRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
