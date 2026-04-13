// src/components/recommendation/PushbackChat.tsx
//
// Inline pushback conversation below the recommendation. The founder
// types concerns, the agent defends/refines/replaces. Mirrors the
// web app's PushbackChat with optimistic UI and rollback.

import { useState, useRef, useEffect } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import type { PushbackTurn } from '@/hooks/useRecommendation';
import { Text, Card, ChatBubble, ChatInput } from '@/components/ui';
import { spacing } from '@/constants/theme';

interface Props {
  recommendationId: string;
  initialHistory:   PushbackTurn[];
  hardCapRound:     number;
  alternativeReady: boolean;
  accepted:         boolean;
  onCommit:         () => void;
}

export function PushbackChat({
  recommendationId,
  initialHistory,
  hardCapRound,
  alternativeReady,
  accepted,
  onCommit,
}: Props) {
  const { colors: c } = useTheme();
  const [history, setHistory] = useState<PushbackTurn[]>(initialHistory);
  const [pending, setPending] = useState(false);
  const [error, setError]     = useState('');
  const flatListRef = useRef<FlatList>(null);

  const userTurns = history.filter(t => t.role === 'user').length;
  const remaining = hardCapRound - userTurns;
  const capReached = userTurns >= hardCapRound || alternativeReady;

  useEffect(() => {
    if (history.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [history.length]);

  async function handleSend(text: string) {
    if (!text.trim() || pending || capReached) return;
    setPending(true);
    setError('');

    const userTurn: PushbackTurn = {
      role: 'user',
      content: text,
      round: userTurns + 1,
      timestamp: new Date().toISOString(),
    };
    setHistory(prev => [...prev, userTurn]);

    try {
      const data = await api<{
        agent: PushbackTurn;
        committed?: boolean;
        closing?: boolean;
      }>(`/api/discovery/recommendations/${recommendationId}/pushback`, {
        method: 'POST',
        body: { message: text },
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHistory(prev => [...prev, data.agent]);

      if (data.committed) {
        onCommit();
      }
    } catch (err) {
      // Rollback optimistic user bubble
      setHistory(prev => prev.slice(0, -1));
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not send. Please try again.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPending(false);
    }
  }

  if (alternativeReady) {
    return (
      <Card variant="muted" style={styles.terminalCard}>
        <Text variant="label" color={c.warning}>
          Discussion closed
        </Text>
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
          An alternative recommendation has been generated based on what
          you argued for. Compare both above and accept the one you want.
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="overline" color={c.mutedForeground}>
          Push back on this recommendation
        </Text>
        {history.length > 0 && (
          <Text variant="caption" color={c.mutedForeground}>
            {userTurns}/{hardCapRound}
            {remaining > 0 && remaining <= 2 ? ` · ${remaining} left` : ''}
          </Text>
        )}
      </View>

      {/* Empty state */}
      {history.length === 0 && (
        <Text variant="caption" color={c.mutedForeground}>
          Disagree with something? Type your concern and I'll engage
          honestly — defending where the recommendation is right,
          refining where I missed something.
        </Text>
      )}

      {/* Accepted warning */}
      {accepted && history.length > 0 && (
        <Card variant="muted" style={{ marginBottom: spacing[2] }}>
          <Text variant="caption" color={c.warning}>
            Posting a new message will reopen the discussion and undo
            your earlier acceptance.
          </Text>
        </Card>
      )}

      {/* Conversation */}
      {history.length > 0 && (
        <FlatList
          ref={flatListRef}
          data={history}
          keyExtractor={(_, i) => `${i}`}
          renderItem={({ item }) => (
            <ChatBubble
              content={item.content}
              role={item.role === 'user' ? 'user' : 'assistant'}
              animated={false}
            />
          )}
          contentContainerStyle={styles.messageList}
          style={styles.messageListContainer}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            pending ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={c.primary} />
              </View>
            ) : null
          }
        />
      )}

      {/* Error */}
      {error ? (
        <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[1] }}>
          {error}
        </Text>
      ) : null}

      {/* Input */}
      {!capReached && (
        <ChatInput
          onSend={handleSend}
          disabled={pending}
          placeholder="Share your concern…"
        />
      )}

      {/* Cap reached waiting state */}
      {capReached && !alternativeReady && (
        <Card variant="muted" style={{ marginTop: spacing[2] }}>
          <Text variant="caption" color={c.mutedForeground}>
            Discussion cap reached. Generating the alternative path you
            argued for — it will appear in a few minutes.
          </Text>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  messageList: {
    gap: spacing[2],
    paddingVertical: spacing[1],
  },
  messageListContainer: {
    maxHeight: 320,
  },
  loadingContainer: {
    alignSelf: 'flex-start',
    paddingVertical: spacing[2],
  },
  terminalCard: {
    gap: spacing[1],
  },
});
