// src/components/discovery/stage2/Stage2Chat.tsx
//
// Mobile counterpart to
// client/src/app/(app)/discovery/no-idea/[sessionId]/Stage2Chat.tsx.
//
// Combines the SkillCanvas + chat into a single scrollable surface
// with the chat input pinned at the bottom (KeyboardAvoidingView).
// Deliberate divergence from web: no SkillCanvasEntry mode picker —
// on mobile the canvas and chat are both visible immediately, so the
// "Drag-and-drop vs Talk me through it" choice is implicit (tap a
// chip or type a message). The agent's first turn still anchors the
// founder regardless.
//
// Layout:
//   - Pinned-top banners: Stage2Banner, cascade re-derive (if needed),
//     turn-error banner
//   - Scrollable FlatList:
//       * ListHeaderComponent — SkillCanvas section + section header
//         for the chat below
//       * Items — chat message bubbles (ChatBubble)
//       * ListFooter — typing indicator when sending/streaming
//   - Pinned-bottom: ChatInput
//
// State flow: the hook owns chat state (messages, status, turnError);
// the parent owns hydration (inventory + flags + onTurnComplete).
// onTurnComplete re-fetches session state so the canvas updates after
// the agent's extractor applies tier moves during streaming.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStage2ChatDispatchers } from './useStage2ChatDispatchers';
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
  Button,
  ChatBubble,
  ChatInput,
  TypingIndicator,
} from '@/components/ui';
import {
  useStage2Session,
  type Stage2Message,
} from '@/hooks/useStage2Session';
import type { SkillInventory } from '@/lib/ideation-types';
import { SkillCanvas } from './SkillCanvas';
import { Stage2Banner } from './Stage2Banner';
import { spacing, radius } from '@/constants/theme';

interface Stage2ChatProps {
  sessionId:           string;
  stageRunId:          string;
  initialMessages:     Stage2Message[];
  inventory:           SkillInventory;
  hasExpectedProfile:  boolean;
  requiresRederivation: boolean;
  /** Parent's session refetch. Called after each streaming turn
   *  completes (the agent's extractor may have moved chips) and
   *  after the 'composing' terminal flips so the dispatcher routes
   *  into RequirementsDocumentView. */
  onSessionRefresh:    () => Promise<void> | void;
}

export function Stage2Chat({
  sessionId,
  stageRunId,
  initialMessages,
  inventory,
  hasExpectedProfile,
  requiresRederivation,
  onSessionRefresh,
}: Stage2ChatProps) {
  const { colors: c } = useTheme();
  const listRef = useRef<FlatList<Stage2Message>>(null);
  const [inputText, setInputText] = useState('');

  const onTurnComplete = useCallback(async () => {
    await onSessionRefresh();
  }, [onSessionRefresh]);

  const stage2 = useStage2Session({
    sessionId,
    stageRunId,
    initialMessages,
    onTurnComplete,
  });

  // 'composing' is the terminal flip on output_ready — parent refetches
  // and the dispatcher transitions to RequirementsDocumentView.
  useEffect(() => {
    if (stage2.status === 'composing') {
      void onSessionRefresh();
    }
  }, [stage2.status, onSessionRefresh]);

  // After canvas mutations, the hook doesn't auto-refresh — callers
  // do. Wrapping logic lives in useStage2ChatDispatchers so each
  // wrapped callback is stable across renders (lets SkillCanvas — and
  // any future React.memo around it — skip unnecessary re-renders).
  const {
    updateSkillTier,
    addTeammate,
    removeTeammate,
    renameTeammate,
    deriveExpectedProfile,
  } = useStage2ChatDispatchers({
    updateSkillTier:       stage2.updateSkillTier,
    addTeammate:           stage2.addTeammate,
    removeTeammate:        stage2.removeTeammate,
    renameTeammate:        stage2.renameTeammate,
    deriveExpectedProfile: stage2.deriveExpectedProfile,
    onSessionRefresh,
  });

  // Auto-scroll when the message list changes — depend on the array
  // reference (not just length) so stream chunks fire this too. The
  // hook returns a new array on every chunk via setMessages(prev =>
  // prev.map(...)). The setTimeout + clearTimeout cleanup debounces
  // to ~50ms after the last update so we don't fire scroll on every
  // single token. Matches Stage 1's pattern in [sessionId].tsx.
  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [stage2.messages]);

  const isBusy =
    stage2.status === 'sending' ||
    stage2.status === 'streaming' ||
    stage2.status === 'composing';
  const isTerminated = stage2.status === 'terminated';
  const canSend = !isBusy && !isTerminated;

  function handleSend(raw: string) {
    const content = raw.trim();
    if (!content || !canSend) return;
    void Haptics.selectionAsync();
    setInputText('');
    void stage2.sendMessage(content);
  }

  const showRederive = requiresRederivation && hasExpectedProfile;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: c.background }]}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Stage 2 — Outcome Requirements',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <FlatList
        ref={listRef}
        data={stage2.messages}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Stage2Banner sessionId={sessionId} forceVisible={stage2.messages.length === 0} />

            {showRederive && (
              <View style={[styles.rederive, { borderColor: c.secondary, backgroundColor: c.secondaryAlpha10 }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color={c.secondary} weight="semibold">
                    Stage 1 was updated
                  </Text>
                  <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                    Re-derive the Expected Profile to align with your new outcome.
                  </Text>
                </View>
                <Button
                  title="Re-derive"
                  onPress={() => { void deriveExpectedProfile(); }}
                  variant="primary"
                  size="sm"
                  disabled={isBusy}
                />
              </View>
            )}

            {stage2.turnError && (
              <View style={[styles.errorBanner, { borderColor: c.destructive, backgroundColor: c.destructiveMuted }]}>
                <Text variant="caption" color={c.destructive} style={{ flex: 1 }}>
                  {stage2.turnError.message}
                </Text>
                <Button
                  title="Dismiss"
                  onPress={stage2.clearError}
                  variant="ghost"
                  size="sm"
                />
              </View>
            )}

            <View style={styles.canvasSection}>
              <Text variant="overline" color={c.mutedForeground}>
                Skill inventory
              </Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1], marginBottom: spacing[3] }}>
                Drag the pill or tap a tier. Updates save instantly.
              </Text>
              <SkillCanvas
                inventory={inventory}
                onUpdateSkillTier={updateSkillTier}
                onAddTeammate={addTeammate}
                onRemoveTeammate={removeTeammate}
                onRenameTeammate={renameTeammate}
                onDerive={deriveExpectedProfile}
                busy={isBusy || isTerminated || stage2.canvasBusy}
                isDeriving={stage2.status === 'composing'}
                hasExpectedProfile={hasExpectedProfile}
              />
            </View>

            <View style={styles.chatHeader}>
              <Text variant="overline" color={c.mutedForeground}>
                Conversation
              </Text>
              {stage2.messages.length === 0 && (
                <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
                  Talk to the agent here. As you describe your experience, the canvas
                  updates and the Expected Profile starts to take shape.
                </Text>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ChatBubble
            content={item.content}
            role={item.role}
            style={{ marginVertical: spacing[1.5] }}
          />
        )}
        ListFooterComponent={
          stage2.status === 'sending' || stage2.status === 'streaming' ? (
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
        placeholder={isTerminated ? 'Session ended.' : 'Tell me about a skill — or just react to a chip you moved.'}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  canvasSection: {
    marginBottom: spacing[6],
  },
  chatHeader: {
    marginBottom: spacing[2],
  },
  rederive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing[3],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing[3],
  },
  typing: {
    marginVertical: spacing[2],
  },
});
