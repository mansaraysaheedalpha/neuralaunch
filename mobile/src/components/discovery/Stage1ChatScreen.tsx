// src/components/discovery/Stage1ChatScreen.tsx
//
// Stage 1 (Outcome Definition) chat surface for the No Idea
// archetype. Owns the useStage1Session hook + chat layout
// (Stage1Banner, message list, contextual banners, ChatInput) and
// bubbles a single `onSessionReady` callback up so the parent
// dispatcher refetches when the agent flips status='composing' on
// output_ready.
//
// Extracted from app/discovery/no-idea/[sessionId].tsx during the
// self-review refactor so the dispatcher stays under the
// React-component file-size cap (CLAUDE.md). The shared BannerStrip
// primitive ships in the same file because it is only used here;
// promoting it to a global UI primitive would be premature.

import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import {
  Text,
  ChatBubble,
  ChatInput,
  TypingIndicator,
} from '@/components/ui';
import { Stage1Banner } from '@/components/discovery/Stage1Banner';
import {
  useStage1Session,
  type Stage1Message,
} from '@/hooks/useStage1Session';
import { spacing } from '@/constants/theme';

type EditableDim = 'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference';

const DIM_LABELS: Record<EditableDim, string> = {
  timeHorizon:         'Time horizon',
  financialGoal:       'Financial goal',
  riskTolerance:       'Risk tolerance',
  lifestylePreference: 'Lifestyle preference',
};

export interface Stage1ChatScreenProps {
  sessionId:         string;
  initialMessages:   Stage1Message[];
  editingDimension:  EditableDim | null;
  hasPriorSnapshot:  boolean;
  documentLoadError: boolean;
  /** Called when the turn handler reports the OutcomeDocument is
   *  composed (status='composing'). The parent refetches session
   *  state so the dispatcher transitions into review mode. */
  onSessionReady:    () => Promise<void>;
}

export function Stage1ChatScreen({
  sessionId,
  initialMessages,
  editingDimension,
  hasPriorSnapshot,
  documentLoadError,
  onSessionReady,
}: Stage1ChatScreenProps) {
  const { colors: c } = useTheme();
  const listRef = useRef<FlatList<Stage1Message>>(null);
  const [inputText, setInputText] = useState('');

  const { messages, status, turnError, sendMessage, clearError } = useStage1Session({
    sessionId,
    initialMessages,
  });

  // The turn route's "composer fired" terminal flips status to
  // 'composing'; this is the mobile equivalent of the web's
  // router.refresh() — refetch session and let the dispatcher route
  // to OutcomeDocumentView.
  useEffect(() => {
    if (status === 'composing') {
      void onSessionReady();
    }
  }, [status, onSessionReady]);

  // Auto-scroll when a new message lands or the streaming assistant
  // bubble grows. Depends on the array reference (not just length)
  // so stream chunks fire too; setTimeout + clearTimeout cleanup
  // naturally debounces to ~50ms after the last update.
  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages]);

  const isBusy = status === 'sending' || status === 'streaming' || status === 'composing';
  const isTerminated = status === 'terminated';
  const canSend = !isBusy && !isTerminated;

  const handleSend = (raw: string) => {
    const content = raw.trim();
    if (!content || !canSend) return;
    void Haptics.selectionAsync();
    setInputText('');
    void sendMessage(content);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: c.background }]}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Stage 1 — Outcome Definition',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <Stage1Banner sessionId={sessionId} forceVisible={messages.length === 0} />

            {editingDimension && (
              <BannerStrip
                tone="gold"
                heading={`Editing: ${DIM_LABELS[editingDimension]}`}
                body={hasPriorSnapshot
                  ? 'You can discard this edit and restore the prior document from the review page.'
                  : undefined}
              />
            )}

            {status === 'composing' && (
              <BannerStrip tone="info" heading="Drafting your Outcome Document…" />
            )}

            {turnError && (
              <BannerStrip
                tone="destructive"
                heading={turnError.message}
                onDismiss={turnError.kind === 'session_terminated' ? undefined : clearError}
              />
            )}

            {documentLoadError && (
              <BannerStrip
                tone="destructive"
                heading="We couldn't load the previous Outcome Document."
                body="Continue the conversation and we'll draft it again."
              />
            )}

            {messages.length === 0 && (
              <View style={styles.empty}>
                <Text variant="body" color={c.mutedForeground}>
                  Tell me a bit about where you are — what kind of life you're trying to
                  build, what feels solid, what doesn't. Wherever you want to start.
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ChatBubble content={item.content} role={item.role} style={{ marginVertical: spacing[1.5] }} />
        )}
        ListFooterComponent={
          status === 'sending' || status === 'streaming' ? (
            <View style={styles.typing}>
              <TypingIndicator />
            </View>
          ) : null
        }
      />

      <ChatInput
        value={inputText}
        onChangeText={setInputText}
        onSend={handleSend}
        disabled={!canSend}
        placeholder={isTerminated ? 'Session ended.' : 'Share your thoughts…'}
      />
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------------- */
/* Banner primitive — shared by edit / composing / error / recovery strips    */
/* -------------------------------------------------------------------------- */

type BannerTone = 'gold' | 'info' | 'destructive';

function BannerStrip({
  tone,
  heading,
  body,
  onDismiss,
}: {
  tone:      BannerTone;
  heading:   string;
  body?:     string;
  onDismiss?: () => void;
}) {
  const { colors: c } = useTheme();

  const palette = tone === 'gold'
    ? { border: c.secondary, bg: c.secondaryAlpha10, fg: c.secondary }
    : tone === 'info'
      ? { border: c.primary, bg: c.primaryAlpha10, fg: c.primary }
      : { border: c.destructive, bg: c.destructiveMuted, fg: c.destructive };

  return (
    <View style={[styles.banner, { borderColor: palette.border, backgroundColor: palette.bg }]}>
      <View style={{ flex: 1 }}>
        <Text variant="caption" color={palette.fg} weight="semibold">
          {heading}
        </Text>
        {body && (
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
            {body}
          </Text>
        )}
      </View>
      {onDismiss && (
        <Text
          variant="caption"
          color={palette.fg}
          onPress={onDismiss}
          accessibilityRole="button"
          style={{ paddingHorizontal: spacing[2] }}
        >
          Dismiss
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  empty: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[6],
  },
  typing: {
    marginVertical: spacing[2],
    paddingHorizontal: spacing[2],
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: spacing[2],
  },
});
