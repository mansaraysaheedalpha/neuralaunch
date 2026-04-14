// src/components/ui/Skeleton.tsx
//
// Animated skeleton placeholder — shown while content loads.
// Pulses between two muted shades for a subtle "loading" feel.
// Matches the design aesthetic by using the theme's muted colors.

import { useEffect, useRef } from 'react';
import { View, Animated, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { radius } from '@/constants/theme';

interface Props {
  width?:  number | string;
  height?: number;
  radius?: keyof typeof radius;
  style?:  ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius: r = 'md',
  style,
}: Props) {
  const { colors: c } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const sizeStyle: ViewStyle = {
    width: width as ViewStyle['width'],
    height,
    borderRadius: radius[r],
    backgroundColor: c.muted,
  };

  return <Animated.View style={[sizeStyle, { opacity }, style]} />;
}

// ---------------------------------------------------------------------------
// Preset skeleton layouts for common screens
// ---------------------------------------------------------------------------

export function CardSkeleton() {
  return (
    <View style={{ gap: 8, padding: 16, borderRadius: radius.xl, backgroundColor: 'transparent' }}>
      <Skeleton width="40%" height={12} />
      <Skeleton width="90%" height={14} />
      <Skeleton width="70%" height={14} />
    </View>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}
