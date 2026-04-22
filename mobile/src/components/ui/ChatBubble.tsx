// src/components/ui/ChatBubble.tsx
//
// Chat message bubble — used across discovery interview, pushback,
// and coach role-play. Distinguishes user vs assistant with different
// alignment, color, and border radius.
//
// The `roleplay` variant tints the assistant bubble gold so the founder
// can visually distinguish "answering real questions" from "rehearsing
// a conversation" — the coach's most valuable phase should not look
// identical to every other chat surface.

import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { radius, spacing, typography } from '@/constants/theme';

type Variant = 'default' | 'roleplay';

interface Props {
  content: string;
  role: 'user' | 'assistant';
  variant?: Variant;
  style?: ViewStyle;
}

export function ChatBubble({ content, role, variant = 'default', style }: Props) {
  const { colors: c, shadows: s } = useTheme();

  const isUser = role === 'user';
  const isRoleplayAssistant = variant === 'roleplay' && !isUser;

  const maxWidth: ViewStyle['maxWidth'] = '85%';

  const backgroundColor = isUser
    ? c.primary
    : isRoleplayAssistant
      ? c.secondaryAlpha10
      : c.muted;

  const bubbleStyle: ViewStyle = {
    backgroundColor,
    borderRadius: radius.xl,
    ...(isUser
      ? { borderBottomRightRadius: radius.sm }
      : { borderBottomLeftRadius: radius.sm }),
    ...(isRoleplayAssistant && {
      borderWidth: 1,
      borderColor: c.secondaryAlpha20,
    }),
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    maxWidth,
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    ...s.sm,
  };

  const textColor = isUser ? c.primaryForeground : c.foreground;

  return (
    <View style={[bubbleStyle, style]}>
      <Text
        variant="body"
        color={textColor}
        style={{
          fontSize: typography.size.base,
          lineHeight: typography.size.base * typography.leading.normal,
        }}
      >
        {content}
      </Text>
    </View>
  );
}
