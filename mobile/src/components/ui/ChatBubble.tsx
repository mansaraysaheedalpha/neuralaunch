// src/components/ui/ChatBubble.tsx
//
// Chat message bubble — used across discovery interview, pushback,
// and coach role-play. Distinguishes user vs assistant with different
// alignment, color, and border radius.

import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { radius, spacing, typography } from '@/constants/theme';

interface Props {
  content: string;
  role: 'user' | 'assistant';
  style?: ViewStyle;
}

export function ChatBubble({ content, role, style }: Props) {
  const { colors: c, shadows: s } = useTheme();

  const isUser = role === 'user';

  const bubbleStyle: ViewStyle = {
    backgroundColor: isUser ? c.primary : c.muted,
    borderRadius: radius.xl,
    ...(isUser
      ? { borderBottomRightRadius: radius.sm }
      : { borderBottomLeftRadius: radius.sm }),
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    maxWidth: '85%' as any,
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    ...s.sm,
  };

  const textColor = isUser ? c.primaryForeground : c.foreground;

  return (
    <View style={[bubbleStyle, style]}>
      <Text
        variant="body"
        color={textColor}
        style={{ fontSize: typography.size.sm, lineHeight: typography.size.sm * typography.leading.relaxed }}
      >
        {content}
      </Text>
    </View>
  );
}
