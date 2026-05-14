// src/app/discovery/no-idea/[sessionId].tsx
//
// No Idea — Stage router. Mirrors the dispatch logic in the web's
// client/src/app/(app)/discovery/no-idea/[sessionId]/page.tsx server
// component: hydrate from GET /api/discovery/no-idea/[sessionId] and
// pick a surface based on the active stage row.
//
// Authoring chat (Phase B), Outcome Document review (Phase C), and
// Stage 2 placeholder copy (Phase D) all live behind this dispatcher;
// Stages 2-5 themselves are not yet implemented on either side, hence
// the placeholder for those stage numbers.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import {
  Text,
  Button,
  ChatBubble,
  ChatInput,
  TypingIndicator,
  ScreenContainer,
} from '@/components/ui';
import { Stage1Banner } from '@/components/discovery/Stage1Banner';
import { Stage2Placeholder } from '@/components/discovery/Stage2Placeholder';
import { StageBeyondPlaceholder } from '@/components/discovery/StageBeyondPlaceholder';
import {
  OutcomeDocumentView,
  type OutcomeDocument,
} from '@/components/discovery/OutcomeDocumentView';
import {
  useStage1Session,
  type Stage1Message,
} from '@/hooks/useStage1Session';
import type {
  Stage2AuthoringState,
  RequirementsDocument,
} from '@/lib/ideation-types';
import { spacing } from '@/constants/theme';

// Response shape from GET /api/discovery/no-idea/[sessionId] —
// kept in sync with the route's NoIdeaSessionResponse type. We
// re-declare here to avoid a cross-package import; the wire contract
// is the source of truth, not either side's local type.
interface SessionHydration {
  sessionId: string;
  active: {
    id:          string;
    stageNumber: number;
    status:      'authoring' | 'output_ready' | 'committed';
    output:      unknown | null;
  };
  messages:          Stage1Message[];
  editingDimension:  'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference' | null;
  hasPriorSnapshot:  boolean;
  documentLoadError: boolean;
  /** Pre-parsed OutcomeDocument. Non-null only when the active row
   *  is Stage 1 in output_ready or committed state AND the output
   *  JSON parsed successfully. */
  document:          OutcomeDocument | null;
  // ── Stage 2 fields (Phase A laid the wire; consumed in Phase B+) ──
  /** Parsed Stage 2 authoring state — non-null when active.stageNumber
   *  === 2 AND active.status === 'authoring'. */
  stage2Authoring:        Stage2AuthoringState | null;
  /** Parsed RequirementsDocument for Stage 2 output_ready / committed. */
  requirements:           RequirementsDocument | null;
  /** Stage 2 counterpart to documentLoadError. */
  requirementsLoadError:  boolean;
}

const DIM_LABELS: Record<NonNullable<SessionHydration['editingDimension']>, string> = {
  timeHorizon:         'Time horizon',
  financialGoal:       'Financial goal',
  riskTolerance:       'Risk tolerance',
  lifestylePreference: 'Lifestyle preference',
};

export default function NoIdeaSessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { colors: c } = useTheme();
  const [hydration, setHydration] = useState<SessionHydration | null>(null);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    setHydrationError(null);
    try {
      const data = await api<SessionHydration>(`/api/discovery/no-idea/${sessionId}`);
      setHydration(data);
    } catch (err) {
      setHydrationError(err instanceof Error ? err.message : 'Could not load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Stage 0 should never appear on this route — the mindset page
  // commits stage 0 straight through. If we somehow land here on it,
  // bounce back to the start screen rather than render a blank surface.
  useEffect(() => {
    if (hydration?.active.stageNumber === 0) {
      router.replace('/discovery/no-idea/mindset' as any);
    }
  }, [hydration, router]);

  if (loading || !sessionId) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: true, headerTitle: '', headerTintColor: c.foreground, headerStyle: { backgroundColor: c.background }, headerShadowVisible: false }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (hydrationError || !hydration) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ headerShown: true, headerTitle: '', headerTintColor: c.foreground, headerStyle: { backgroundColor: c.background }, headerShadowVisible: false }} />
        <View style={styles.centered}>
          <Text variant="title" align="center">Could not load session</Text>
          <Text variant="caption" color={c.mutedForeground} align="center" style={{ marginTop: spacing[2] }}>
            {hydrationError ?? 'Unknown error'}
          </Text>
          <View style={{ marginTop: spacing[6], gap: spacing[2], width: '100%' }}>
            <Button title="Retry" onPress={() => { setLoading(true); void loadSession(); }} fullWidth />
            <Button title="Back to discovery" onPress={() => router.replace('/discovery' as any)} variant="ghost" fullWidth />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // Dispatch based on active stage state.
  // Stage 2 ships on web but not yet on mobile — the Stage2Placeholder
  // surface deep-links the founder to the web's session URL so they
  // aren't stranded. Stages 3+ aren't on web yet either, so they fall
  // back to the generic StageBeyondPlaceholder.
  if (hydration.active.stageNumber === 2) {
    return <Stage2Placeholder sessionId={sessionId} />;
  }
  if (hydration.active.stageNumber >= 3) {
    return <StageBeyondPlaceholder stageNumber={hydration.active.stageNumber} />;
  }

  if (hydration.active.stageNumber === 1 && hydration.active.status === 'authoring') {
    return (
      <Stage1ChatScreen
        sessionId={sessionId}
        initialMessages={hydration.messages}
        editingDimension={hydration.editingDimension}
        hasPriorSnapshot={hydration.hasPriorSnapshot}
        documentLoadError={hydration.documentLoadError}
        onSessionReady={loadSession}
      />
    );
  }

  // output_ready or committed. Mirrors the web page.tsx fall-through:
  // if the document JSON failed to parse, route back to Stage1Chat in
  // a degraded "documentLoadError" mode so the agent can recompose;
  // otherwise render the document review surface.
  if (hydration.documentLoadError || !hydration.document) {
    return (
      <Stage1ChatScreen
        sessionId={sessionId}
        initialMessages={[]}
        editingDimension={null}
        hasPriorSnapshot={false}
        documentLoadError
        onSessionReady={loadSession}
      />
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Outcome Document',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />
      <OutcomeDocumentView
        stageRunId={hydration.active.id}
        status={hydration.active.status as 'output_ready' | 'committed'}
        document={hydration.document}
        onAfterAction={loadSession}
      />
    </ScreenContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Stage 1 chat                                                                */
/* -------------------------------------------------------------------------- */

interface Stage1ChatScreenProps {
  sessionId:          string;
  initialMessages:    Stage1Message[];
  editingDimension:   SessionHydration['editingDimension'];
  hasPriorSnapshot:   boolean;
  documentLoadError:  boolean;
  /** Called when the turn handler reports the OutcomeDocument is
   *  composed (status='composing'). The parent refetches session
   *  state so the dispatcher transitions into review mode. */
  onSessionReady:     () => Promise<void>;
}

function Stage1ChatScreen({
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
  // to OutcomeReadyScreen / OutcomeDocumentView.
  useEffect(() => {
    if (status === 'composing') {
      void onSessionReady();
    }
  }, [status, onSessionReady]);

  // Auto-scroll when a new message lands or the streaming assistant
  // message grows. Use setTimeout so the list has measured the new row.
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
  tone:     BannerTone;
  heading:  string;
  body?:    string;
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

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
  },
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
