// src/components/ui/ChatBubble.tsx
//
// Chat message bubble — used across discovery interview, pushback,
// and coach role-play. Distinguishes user vs assistant with different
// alignment, color, and border radius.

import { View, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { radius, spacing, typography, shadows } from '@/constants/theme';

interface Props {
  content: string;
  role: 'user' | 'assistant';
  /** Animate the bubble's entrance */
  animated?: boolean;
  style?: ViewStyle;
}

export function ChatBubble({ content, role, animated = true, style }: Props) {
  const { colors: c } = useTheme();

  const isUser = role === 'user';

  const bubbleStyle: ViewStyle = {
    backgroundColor: isUser ? c.primary : c.muted,
    borderRadius: radius.xl,
    // Flatten the corner where the bubble "attaches" to the avatar side
    ...(isUser
      ? { borderBottomRightRadius: radius.sm }
      : { borderBottomLeftRadius: radius.sm }),
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    maxWidth: '85%',
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    ...shadows.sm,
  };

  const textColor = isUser ? c.primaryForeground : c.foreground;

  const Wrapper = animated ? Animated.View : View;
  const animationProps = animated
    ? { entering: FadeInUp.duration(200).springify().damping(18) }
    : {};

  return (
    <Wrapper style={[bubbleStyle, style]} {...animationProps}>
      <Text
        variant="body"
        color={textColor}
        style={{ fontSize: typography.size.sm, lineHeight: typography.size.sm * typography.leading.relaxed }}
      >
        {content}
      </Text>
    </Wrapper>
  );
}
