// src/app/discovery/index.tsx
//
// Discovery interview screen — the core NeuraLaunch experience.
// A streaming chat that adapts its questions based on the founder's
// answers, then synthesises a single committed recommendation.

import { useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { useDiscovery, type ChatMessage } from '@/hooks/useDiscovery';
import {
  Text,
  ChatBubble,
  ChatInput,
  TypingIndicator,
  Card,
  Button,
} from '@/components/ui';
import { spacing } from '@/constants/theme';

export default function DiscoveryScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const {
    messages,
    status,
    sessionReady,
    isSynthesizing,
    synthesisError,
    recommendation,
    initSession,
    sendMessage,
  } = useDiscovery();

  // Init session on mount
  useEffect(() => {
    void initSession();
  }, [initSession]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Navigate to recommendation when synthesis completes
  useEffect(() => {
    if (recommendation) {
      router.replace(`/recommendation/${recommendation.id}`);
    }
  }, [recommendation, router]);

  const isLoading = status === 'loading';
  const isStreaming = status === 'streaming';
  const canSend = sessionReady && !isSynthesizing && !isLoading && !isStreaming;

  function renderMessage({ item }: { item: ChatMessage }) {
    return (
      <ChatBubble
        content={item.content}
        role={item.role}
        animated
      />
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Discovery',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
          headerBackTitle: 'Home',
        }}
      />

      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: c.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Welcome state */}
        {messages.length === 0 && !isLoading && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.welcome}>
            <Text variant="title" align="center">
              Tell me about your situation
            </Text>
            <Text
              variant="body"
              color={c.mutedForeground}
              align="center"
              style={{ marginTop: spacing[2] }}
            >
              Share what you're working with — your background, your
              frustrations, what you've tried. I'll ask the right
              questions to understand your situation fully before
              recommending anything.
            </Text>
          </Animated.View>
        )}

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <>
              {isLoading && !isStreaming && <TypingIndicator />}
              {isSynthesizing && (
                <SynthesisProgress error={synthesisError} />
              )}
            </>
          }
        />

        {/* Input */}
        {!isSynthesizing && (
          <ChatInput
            onSend={sendMessage}
            disabled={!canSend}
            placeholder={
              !sessionReady
                ? 'Setting up your session…'
                : 'Share your thoughts…'
            }
          />
        )}
      </KeyboardAvoidingView>
    </>
  );
}

// ---------------------------------------------------------------------------
// Synthesis progress component
// ---------------------------------------------------------------------------

function SynthesisProgress({ error }: { error: boolean }) {
  const { colors: c } = useTheme();

  if (error) {
    return (
      <Card variant="muted" style={styles.synthesisCard}>
        <Text variant="label" color={c.destructive} align="center">
          Something went wrong
        </Text>
        <Text variant="caption" color={c.mutedForeground} align="center" style={{ marginTop: spacing[1] }}>
          Your recommendation could not be generated. Please try again.
        </Text>
      </Card>
    );
  }

  return (
    <Card variant="primary" style={styles.synthesisCard}>
      <Text variant="label" color={c.primary} align="center">
        Building your recommendation
      </Text>
      <Text variant="caption" color={c.mutedForeground} align="center" style={{ marginTop: spacing[1] }}>
        Analysing your context, researching your market, and crafting
        one honest recommendation. This takes about 30 seconds.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  welcome: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
  },
  messageList: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
    gap: spacing[3],
  },
  synthesisCard: {
    marginHorizontal: spacing[4],
    marginTop: spacing[4],
  },
});
