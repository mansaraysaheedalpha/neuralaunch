// src/app/discovery/index.tsx
//
// Discovery interview screen — the core NeuraLaunch experience.
// A streaming chat that adapts its questions based on the founder's
// answers, then synthesises a single committed recommendation.

import { useEffect, useRef, useState } from 'react';
import { View, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { HelpCircle } from 'lucide-react-native';

import { useTheme } from '@/hooks/useTheme';
import { useDiscovery, fetchIncompleteSession, type ChatMessage } from '@/hooks/useDiscovery';
import {
  Text,
  ChatBubble,
  ChatInput,
  TypingIndicator,
  Card,
  Button,
} from '@/components/ui';
import { InterviewGuide } from '@/components/discovery/InterviewGuide';
import { SessionResumption } from '@/components/discovery/SessionResumption';
import { spacing } from '@/constants/theme';

type InitPhase = 'checking' | 'resumable' | 'chat';

export default function DiscoveryScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [guideVisible, setGuideVisible] = useState(false);
  const [initPhase, setInitPhase] = useState<InitPhase>('checking');
  const [incomplete, setIncomplete] = useState<{ sessionId: string; questionCount: number } | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);

  const {
    messages,
    status,
    sessionReady,
    isSynthesizing,
    synthesisError,
    recommendation,
    initSession,
    resumeSession,
    discardSession,
    sendMessage,
  } = useDiscovery();

  // Check for incomplete session on mount
  useEffect(() => {
    async function check() {
      const existing = await fetchIncompleteSession();
      if (existing) {
        setIncomplete(existing);
        setInitPhase('resumable');
      } else {
        setInitPhase('chat');
        void initSession();
      }
    }
    void check();
  }, [initSession]);

  async function handleResume() {
    if (!incomplete) return;
    setResumeLoading(true);
    await resumeSession(incomplete.sessionId);
    setInitPhase('chat');
    setResumeLoading(false);
  }

  async function handleDiscard() {
    if (!incomplete) return;
    await discardSession(incomplete.sessionId);
    setIncomplete(null);
    setInitPhase('chat');
  }

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
          headerRight: () => (
            <Pressable
              onPress={() => setGuideVisible(true)}
              style={{ padding: spacing[2] }}
            >
              <HelpCircle size={22} color={c.mutedForeground} />
            </Pressable>
          ),
        }}
      />

      <InterviewGuide
        visible={guideVisible}
        onClose={() => setGuideVisible(false)}
      />

      {/* Resumption prompt when an incomplete session exists */}
      {initPhase === 'resumable' && incomplete ? (
        <SessionResumption
          questionCount={incomplete.questionCount}
          onResume={handleResume}
          onDiscard={() => { void handleDiscard(); }}
          loading={resumeLoading}
        />
      ) : (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: c.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Welcome state */}
        {messages.length === 0 && !isLoading && (
          <View style={styles.welcome}>
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
          </View>
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
      )}
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
