// src/components/ui/ChatInput.tsx
//
// Chat input bar — sticky at the bottom of every chat screen.
// Supports multi-line expansion, send button with haptic feedback,
// and disabled state during streaming.

import { useState, useRef } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';
import { spacing, radius, typography } from '@/constants/theme';

interface Props {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: ViewStyle;
}

export function ChatInput({
  onSend,
  placeholder = 'Share your thoughts…',
  disabled = false,
  style,
}: Props) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const canSend = text.trim().length > 0 && !disabled;

  function handleSend() {
    if (!canSend) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = text.trim();
    setText('');
    onSend(message);
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: c.card,
          borderTopColor: c.border,
          paddingBottom: Math.max(insets.bottom, spacing[2]),
        },
        style,
      ]}
    >
      <View style={[styles.inputRow, { borderColor: c.border, backgroundColor: c.background }]}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={c.placeholder}
          editable={!disabled}
          multiline
          maxLength={4000}
          style={[styles.input, { color: c.foreground }]}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          returnKeyType="default"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendButton,
            {
              backgroundColor: canSend ? c.primary : 'transparent',
              opacity: pressed && canSend ? 0.8 : canSend ? 1 : 0.3,
            },
          ]}
        >
          <Text
            variant="label"
            color={canSend ? c.primaryForeground : c.mutedForeground}
            style={{ fontSize: typography.size.sm }}
          >
            ↑
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingLeft: spacing[4],
    paddingRight: spacing[1.5],
    paddingVertical: spacing[1.5],
    gap: spacing[2],
  },
  input: {
    flex: 1,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.leading.relaxed,
    maxHeight: 100,
    paddingVertical: spacing[1],
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
