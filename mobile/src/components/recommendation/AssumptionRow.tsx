// src/components/recommendation/AssumptionRow.tsx
//
// Each assumption on a recommendation has a flag button. Tapping it
// streams an AI response explaining specifically what changes if the
// assumption is false. "Add more context" opens an inline input that
// re-streams with the clarification folded in.

import { useState, useRef } from 'react';
import { View, Pressable, StyleSheet, TextInput as RNTextInput } from 'react-native';
import { ThumbsDown, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { API_BASE_URL, getToken } from '@/services/api-client';
import { Text } from '@/components/ui';
import { spacing, radius, typography } from '@/constants/theme';

interface Props {
  text:      string;
  path:      string;
  reasoning: string;
}

export function AssumptionRow({ text, path, reasoning }: Props) {
  const { colors: c } = useTheme();
  const [flagged, setFlagged]       = useState(false);
  const [response, setResponse]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [showClarify, setShowClarify] = useState(false);
  const [clarifyText, setClarifyText] = useState('');
  const clarifyRef = useRef<RNTextInput>(null);

  async function stream(clarification?: string) {
    setLoading(true);
    setResponse('');

    try {
      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE_URL}/api/discovery/assumption-check`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            assumption: text,
            path,
            reasoning,
            clarification,
          }),
        },
      );

      if (!res.body) {
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setResponse(acc);
      }
    } catch { /* non-fatal */ }
    setLoading(false);
  }

  function handleFlag() {
    if (flagged) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFlagged(true);
    void stream();
  }

  function handleClarifyOpen() {
    void Haptics.selectionAsync();
    setShowClarify(true);
    setTimeout(() => clarifyRef.current?.focus(), 100);
  }

  function handleClarifySubmit() {
    const val = clarifyText.trim();
    if (!val) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowClarify(false);
    setClarifyText('');
    void stream(val);
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text variant="caption" color={c.mutedForeground}>—</Text>
        <Text variant="body" color={c.foreground} style={{ flex: 1, opacity: 0.85 }}>
          {text}
        </Text>
        <Pressable
          onPress={handleFlag}
          disabled={flagged}
          style={styles.flagButton}
        >
          <ThumbsDown
            size={14}
            color={flagged ? c.destructive : c.mutedForeground}
            style={{ opacity: flagged ? 1 : 0.4 }}
          />
        </Pressable>
      </View>

      {flagged && (
        <View style={styles.responseSection}>
          {loading && !response && (
            <Text variant="caption" color={c.mutedForeground} style={{ fontStyle: 'italic' }}>
              Thinking…
            </Text>
          )}
          {response && (
            <Text variant="caption" color={c.mutedForeground} style={{ fontStyle: 'italic' }}>
              {response}
            </Text>
          )}

          {!loading && !showClarify && (
            <Pressable onPress={handleClarifyOpen} style={{ alignSelf: 'flex-start' }}>
              <Text variant="caption" color={c.mutedForeground} style={{ textDecorationLine: 'underline' }}>
                Add more context →
              </Text>
            </Pressable>
          )}

          {showClarify && (
            <View style={[styles.clarifyRow, { borderColor: c.border, backgroundColor: c.muted }]}>
              <RNTextInput
                ref={clarifyRef}
                value={clarifyText}
                onChangeText={setClarifyText}
                onSubmitEditing={handleClarifySubmit}
                placeholder="Tell us more about your situation…"
                placeholderTextColor={c.placeholder}
                multiline
                maxLength={1000}
                style={[styles.clarifyInput, { color: c.foreground }]}
              />
              <Pressable
                onPress={handleClarifySubmit}
                disabled={!clarifyText.trim()}
                style={[styles.clarifyButton, { backgroundColor: c.muted, opacity: clarifyText.trim() ? 1 : 0.4 }]}
              >
                <ArrowRight size={14} color={c.foreground} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[1.5],
  },
  row: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  flagButton: {
    padding: spacing[1],
  },
  responseSection: {
    marginLeft: spacing[4],
    gap: spacing[2],
  },
  clarifyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[2],
  },
  clarifyInput: {
    flex: 1,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.leading.relaxed,
    paddingVertical: spacing[1],
    maxHeight: 80,
  },
  clarifyButton: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
