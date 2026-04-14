// src/components/ui/FadeInView.tsx
//
// Subtle entrance animation — opacity 0 → 1 with a small translateY
// slide. Uses plain RN Animated API (native driver, no reanimated)
// because Expo Go doesn't load reanimated's TurboModule.
//
// Defaults are intentionally small: 260ms, 8px rise. Enough for the
// eye to register motion without feeling dramatic.

import { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Delay in ms before the animation starts — useful for staggered lists. */
  delay?: number;
  /** Duration in ms. Default 260. */
  duration?: number;
  /** Initial vertical offset in px. Default 8. */
  translateY?: number;
  style?: ViewStyle;
}

export function FadeInView({
  children,
  delay = 0,
  duration = 260,
  translateY = 8,
  style,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty     = useRef(new Animated.Value(translateY)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(ty,      { toValue: 0, duration, delay, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, ty, delay, duration]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY: ty }] }, style]}>
      {children}
    </Animated.View>
  );
}
