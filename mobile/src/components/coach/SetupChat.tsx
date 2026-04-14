// src/components/coach/SetupChat.tsx
//
// 1–3 turn setup conversation for the Conversation Coach.
// The agent asks about who, objective, fear, channel.
// When setup is complete, calls onSetupComplete with the setup data.

import { useState, useRef, useEffect } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, ChatBubble, ChatInput, TypingIndicator } from '@/components/ui';
import { spacing } from '@/constants/theme';

interface SetupData {
  who:        string;
  objective:  string;
  fear:       string;
  channel:    string;
}

interface Props {
  roadmapId: string;
  taskId?:   string;
  onSetupComplete: (setup: SetupData) => void;
}

interface Message {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

export function SetupChat({ roadmapId, taskId, onSetupComplete }: Props) {
  const { colors: c } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  async function handleSend(text: string) {
    if (!text.trim() || pending) return;
    setPending(true);
    setError(null);

    const userMsg: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: text,
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const basePath = taskId
        ? `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/coach/setup`
        : `/api/discovery/roadmaps/${roadmapId}/coach/setup`;

      const data = await api<{
        message: string;
        setupComplete: boolean;
        setup?: SetupData;
      }>(basePath, {
        method: 'POST',
        body: {
          message: text,
          history: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
        },
      });

      const assistantMsg: Message = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: data.message,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.setupComplete && data.setup) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Small delay so the user can read the final message
        setTimeout(() => onSetupComplete(data.setup!), 1500);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Welcome */}
      {messages.length === 0 && (
        <View style={styles.welcome}>
          <Text variant="body" color={c.mutedForeground}>
            Tell me about the conversation you need to have. Who are you
            talking to, what do you need from it, and what are you worried
            about?
          </Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ChatBubble content={item.content} role={item.role} />
        )}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={pending ? <TypingIndicator /> : null}
      />

      {error && (
        <Text variant="caption" color={c.destructive} style={{ paddingHorizontal: spacing[4] }}>
          {error}
        </Text>
      )}

      <ChatInput
        onSend={handleSend}
        disabled={pending}
        placeholder="Describe the conversation…"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  welcome: {
    padding: spacing[5],
  },
  messageList: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    paddingBottom: spacing[2],
  },
});
