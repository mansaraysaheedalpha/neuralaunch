// src/components/coach/RolePlayChat.tsx
//
// Role-play rehearsal — the AI plays the other party in character.
// Visually distinct from all other chat surfaces: different background,
// "REHEARSAL MODE" indicator, the other party's name as the identity.

import { useState, useRef, useEffect } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, ChatBubble, ChatInput, Badge, Card } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

interface RolePlayTurn {
  role:    'founder' | 'other_party';
  message: string;
  turn:    number;
}

interface Props {
  roadmapId:  string;
  taskId?:    string;
  otherParty: string;  // name/role of the person being simulated
  channel:    string;
  onComplete: (history: RolePlayTurn[]) => void;
}

const MAX_TURNS = 10;
const WARN_TURN = 8;

export function RolePlayChat({ roadmapId, taskId, otherParty, channel, onComplete }: Props) {
  const { colors: c } = useTheme();
  const [history, setHistory] = useState<RolePlayTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const founderTurns = history.filter(t => t.role === 'founder').length;
  const remaining = MAX_TURNS - founderTurns;
  const capReached = founderTurns >= MAX_TURNS;

  useEffect(() => {
    if (history.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [history.length]);

  async function handleSend(text: string) {
    if (!text.trim() || pending || capReached) return;
    setPending(true);
    setError(null);

    const founderTurn: RolePlayTurn = {
      role: 'founder',
      message: text,
      turn: founderTurns + 1,
    };
    setHistory(prev => [...prev, founderTurn]);

    try {
      const basePath = taskId
        ? `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/coach/roleplay`
        : `/api/discovery/roadmaps/${roadmapId}/coach/roleplay`;

      const data = await api<{ message: string; turn: number }>(basePath, {
        method: 'POST',
        body: {
          message: text,
          history: history.map(t => `${t.role}: ${t.message}`).join('\n'),
        },
      });

      const otherTurn: RolePlayTurn = {
        role: 'other_party',
        message: data.message,
        turn: data.turn,
      };
      setHistory(prev => [...prev, otherTurn]);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      setHistory(prev => prev.slice(0, -1));
      setError(err instanceof ApiError ? err.message : 'Could not send. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPending(false);
    }
  }

  function handleEndRehearsal() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onComplete(history);
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Rehearsal mode banner */}
      <View style={[styles.banner, { backgroundColor: c.primaryAlpha10, borderBottomColor: c.primaryAlpha20 }]}>
        <Badge label="REHEARSAL MODE" variant="primary" />
        <Text variant="caption" color={c.mutedForeground}>
          Speaking with: {otherParty} ({channel})
        </Text>
        <View style={styles.bannerMeta}>
          <Text variant="caption" color={c.mutedForeground}>
            {founderTurns}/{MAX_TURNS}
            {remaining <= 2 && remaining > 0 ? ` · ${remaining} left` : ''}
          </Text>
          <Text
            variant="label"
            color={c.primary}
            onPress={handleEndRehearsal}
          >
            End rehearsal
          </Text>
        </View>
      </View>

      {/* Warning at turn 8 */}
      {founderTurns >= WARN_TURN && !capReached && (
        <View style={[styles.warnBanner, { backgroundColor: c.warningMuted }]}>
          <Text variant="caption" color={c.warning}>
            {remaining} turn{remaining !== 1 ? 's' : ''} remaining.
            Start wrapping up or end the rehearsal.
          </Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={history}
        keyExtractor={(_, i) => `${i}`}
        renderItem={({ item }) => (
          <ChatBubble
            content={item.message}
            role={item.role === 'founder' ? 'user' : 'assistant'}
          />
        )}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        style={styles.messageListContainer}
      />

      {error && (
        <Text variant="caption" color={c.destructive} style={{ paddingHorizontal: spacing[4] }}>
          {error}
        </Text>
      )}

      {/* Input or cap-reached state */}
      {capReached ? (
        <View style={styles.capReached}>
          <Card variant="muted">
            <Text variant="caption" color={c.mutedForeground}>
              Rehearsal complete — you've used all {MAX_TURNS} turns.
            </Text>
          </Card>
          <View style={{ padding: spacing[4] }}>
            <Text
              variant="label"
              color={c.primary}
              onPress={handleEndRehearsal}
              style={{ textAlign: 'center' }}
            >
              View your debrief →
            </Text>
          </View>
        </View>
      ) : (
        <ChatInput
          onSend={handleSend}
          disabled={pending}
          placeholder={`Respond as yourself to ${otherParty}…`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    gap: spacing[1],
  },
  bannerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  warnBanner: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  messageList: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    paddingVertical: spacing[4],
  },
  messageListContainer: {
    flex: 1,
  },
  capReached: {
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
});
