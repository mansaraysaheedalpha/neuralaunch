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
import { ArrowUp } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { spacing, radius, typography } from '@/constants/theme';

interface Props {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: ViewStyle;
  /**
   * Optional controlled props. **Provide both or neither.** When both
   * `value` and `onChangeText` are provided, ChatInput reads/writes
   * through the parent — this enables voice input (parent inserts
   * transcribed text) and any other imperative insertion. When
   * neither is provided, ChatInput keeps its own internal state
   * (back-compat default). A one-of-two configuration falls back to
   * uncontrolled, which would produce a read-only input from the
   * parent's perspective — a dev warning fires in that case.
   */
  value?: string;
  onChangeText?: (text: string) => void;
  /**
   * Rendered to the left of the text field, inside the input row.
   * Used by discovery chat to plug in a VoiceInputButton for
   * Compound-tier founders.
   */
  leftSlot?: React.ReactNode;
}

export function ChatInput({
  onSend,
  placeholder = 'Share your thoughts…',
  disabled = false,
  style,
  value,
  onChangeText,
  leftSlot,
}: Props) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [internalText, setInternalText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const isControlled = value !== undefined && onChangeText !== undefined;
  const text = isControlled ? value : internalText;
  const setText = isControlled ? onChangeText : setInternalText;

  // Dev warning for the half-controlled configuration — supplying one
  // of {value, onChangeText} but not the other silently falls back to
  // uncontrolled, producing a read-only input from the parent's
  // perspective. Fires once per mount via the warn dedup below.
  if (__DEV__) {
    const hasValue = value !== undefined;
    const hasSetter = onChangeText !== undefined;
    if (hasValue !== hasSetter) {
      // eslint-disable-next-line no-console
      console.warn(
        '[ChatInput] `value` and `onChangeText` must be provided together. ' +
        'Supplying only one falls back to uncontrolled state and your ' +
        'prop will be ignored.',
      );
    }
  }

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
      <View
        style={[
          styles.inputRow,
          {
            borderColor: c.border,
            backgroundColor: c.background,
            // When a leftSlot is rendered, mirror the send button's
            // right padding so the row stays visually symmetric.
            paddingLeft: leftSlot ? spacing[1.5] : spacing[4],
          },
        ]}
      >
        {leftSlot}
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
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => [
            styles.sendHitArea,
            { opacity: pressed && canSend ? 0.8 : 1 },
          ]}
        >
          <View
            style={[
              styles.sendCircle,
              {
                backgroundColor: canSend ? c.primary : 'transparent',
                opacity: canSend ? 1 : 0.3,
              },
            ]}
          >
            <ArrowUp
              size={20}
              color={canSend ? c.primaryForeground : c.mutedForeground}
              strokeWidth={2.5}
            />
          </View>
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
  sendHitArea: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
