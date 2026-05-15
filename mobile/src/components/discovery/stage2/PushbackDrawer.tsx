// src/components/discovery/stage2/PushbackDrawer.tsx
//
// Mobile counterpart to client/src/components/ideation/PushbackDrawer.tsx.
// Inline drawer that hosts a multi-round pushback dialogue on a
// single ExpectedProfileEntry — up to EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND
// rounds (5 on the canonical schema). The engine coerces the agent's
// action to 'closing' on the cap turn; pushback.status flips to
// 'closed' on a closing-move OR cap, which the drawer reads to lock
// the input and surface a "pushback closed" cue.
//
// The drawer is presentational: parent (ExpectedProfileView) hands
// in the entry + an onPushback callback that performs the network
// write. On success the drawer leaves itself open so the founder
// can read the agent's closing message before dismissing.

import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button, TextInput } from '@/components/ui';
import type {
  ExpectedProfileEntry,
  ExpectedProfilePushbackAction,
} from '@/lib/ideation-types';
import { spacing, iconSize, radius } from '@/constants/theme';

// Mirror of client/src/lib/ideation/stage2-requirements/constants.ts.
// Keep in lock-step; the engine coerces action='closing' on the cap.
const EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND = 5;

export interface PushbackResponse {
  action:  ExpectedProfilePushbackAction;
  message: string;
  entry:   ExpectedProfileEntry;
  version: number;
  status:  'open' | 'closed';
}

interface Props {
  entryIndex: number;
  entry:      ExpectedProfileEntry;
  onPushback: (args: {
    entryIndex:   number;
    message:      string;
    priorVersion: number;
  }) => Promise<PushbackResponse>;
  onClose:    () => void;
}

export function PushbackDrawer({ entryIndex, entry, onPushback, onClose }: Props) {
  const { colors: c } = useTheme();
  const [message, setMessage]                 = useState('');
  const [busy,    setBusy]                    = useState(false);
  const [error,   setError]                   = useState<string | null>(null);
  // Track the version the engine sees so each round optimistically-
  // locks against the previous server-write — same pattern as the
  // web drawer.
  const [pendingVersion, setPendingVersion] = useState<number>(entry.pushback?.version ?? 0);

  const history = entry.pushback?.history ?? [];
  const closed  = entry.pushback?.status === 'closed';
  const round   = history.length + 1;

  async function submit() {
    const trimmed = message.trim();
    if (!trimmed || busy || closed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onPushback({
        entryIndex,
        message:      trimmed,
        priorVersion: pendingVersion,
      });
      setPendingVersion(result.version);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pushback round failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel="Pushback drawer"
      style={[styles.drawer, { borderColor: c.border, backgroundColor: c.background }]}
    >
      <View style={styles.header}>
        <Text variant="caption" color={c.foreground} weight="semibold">
          Pushback drawer
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close pushback drawer"
          onPress={onClose}
          hitSlop={8}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <X size={iconSize.sm} color={c.mutedForeground} />
        </Pressable>
      </View>

      {history.length > 0 && (
        <View style={styles.historyList}>
          {history.map((h, i) => (
            <View key={i} style={styles.round}>
              <Text variant="caption" color={c.mutedForeground}>
                Round {h.round} ({h.agentMode}, {h.agentAction})
              </Text>
              <View style={[styles.bubble, { backgroundColor: c.muted }]}>
                <Text variant="caption" color={c.mutedForeground}>you:</Text>
                <Text variant="body" color={c.foreground}>{h.founderMessage}</Text>
              </View>
              <View style={[styles.bubble, { backgroundColor: c.primaryAlpha5 }]}>
                <Text variant="caption" color={c.mutedForeground}>agent:</Text>
                <Text variant="body" color={c.foreground}>{h.agentMessage}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {!closed ? (
        <View style={styles.form}>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Push back on this requirement — what does the agent have wrong?"
            multiline
            numberOfLines={3}
            maxLength={2000}
            editable={!busy}
            style={styles.input}
          />
          <View style={styles.formFooter}>
            <Text variant="caption" color={c.mutedForeground}>
              Round {round} of {EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND}
            </Text>
            <Button
              title={busy ? 'Sending…' : 'Send'}
              onPress={() => { void submit(); }}
              variant="primary"
              size="sm"
              disabled={busy || !message.trim()}
              loading={busy}
            />
          </View>
          {error && (
            <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[1] }}>
              {error}
            </Text>
          )}
        </View>
      ) : (
        <Text variant="caption" color={c.mutedForeground} style={{ fontStyle: 'italic', marginTop: spacing[2] }}>
          Pushback closed for this entry. Use the canvas to update your skill levels, or
          commit the document if you accept this requirement as-is.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  historyList: {
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  round: {
    gap: spacing[1],
  },
  bubble: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderRadius: radius.sm,
  },
  form: {
    gap: spacing[2],
  },
  input: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  formFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
