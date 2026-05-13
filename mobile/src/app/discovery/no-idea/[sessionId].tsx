// src/app/discovery/no-idea/[sessionId].tsx
//
// No Idea — Stage router. Mirrors the dispatch logic in the web's
// client/src/app/(app)/discovery/no-idea/[sessionId]/page.tsx server
// component: hydrate from GET /api/discovery/no-idea/[sessionId] and
// pick a surface based on the active stage row.
//
// Phase B ships the authoring chat surface in full. output_ready /
// committed states currently route to a "ready, view on web" message
// because OutcomeDocumentView is the Phase C deliverable. Stages 2+
// drop onto Stage2Placeholder copy (Phase D will swap in the real
// per-stage UX).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import {
  Text,
  Button,
  Card,
  ChatBubble,
  ChatInput,
  TypingIndicator,
  ScreenContainer,
} from '@/components/ui';
import { Stage1Banner } from '@/components/discovery/Stage1Banner';
import {
  useStage1Session,
  type Stage1Message,
  type Stage1Status,
  type Stage1TurnError,
} from '@/hooks/useStage1Session';
import { spacing, iconSize } from '@/constants/theme';

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
  if (hydration.active.stageNumber >= 2) {
    return <Stage2PlaceholderScreen stageNumber={hydration.active.stageNumber} />;
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

  // output_ready or committed — OutcomeDocumentView is the Phase C
  // deliverable; for now route the founder to the web equivalent.
  return <OutcomeReadyScreen sessionId={sessionId} />;
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
            <Stage1Banner forceVisible={messages.length === 0} />

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
/* Outcome-ready bridge (Phase C target)                                      */
/* -------------------------------------------------------------------------- */

function OutcomeReadyScreen({ sessionId }: { sessionId: string }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const apiUrl = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? '';
  const webUrl = apiUrl ? `${apiUrl}/discovery/no-idea/${sessionId}` : null;

  async function openOnWeb() {
    if (!webUrl) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try { await Linking.openURL(webUrl); } catch { /* best-effort */ }
  }

  return (
    <ScreenContainer>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Outcome Document',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <View style={styles.heroIconWrap}>
        <View style={[styles.heroIcon, { backgroundColor: c.primaryAlpha10 }]}>
          <Sparkles size={iconSize.lg} color={c.primary} />
        </View>
      </View>

      <Text variant="title" align="center">Your Outcome Document is ready</Text>
      <Text variant="body" color={c.mutedForeground} align="center" style={styles.subtitle}>
        Stage 1 is complete — the review and edit UI ships on mobile in
        Phase C. Open it on the web to read, edit dimensions, or commit
        and move on to Stage 2.
      </Text>

      <Card style={styles.sessionCard}>
        <Text variant="overline" color={c.mutedForeground}>Session ID</Text>
        <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[1] }}>
          {sessionId}
        </Text>
      </Card>

      <View style={styles.cta}>
        <Button
          title="Open on the web"
          onPress={() => { void openOnWeb(); }}
          variant="primary"
          size="lg"
          disabled={!webUrl}
          fullWidth
        />
        <Button
          title="Back to discovery"
          onPress={() => router.replace('/discovery' as any)}
          variant="ghost"
          size="lg"
          fullWidth
        />
      </View>
    </ScreenContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Stage 2 placeholder                                                        */
/* -------------------------------------------------------------------------- */

function Stage2PlaceholderScreen({ stageNumber }: { stageNumber: number }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  return (
    <ScreenContainer>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: `Stage ${stageNumber}`,
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />
      <View style={styles.centered}>
        <Text variant="title" align="center">Stage {stageNumber} — coming soon</Text>
        <Text variant="body" color={c.mutedForeground} align="center" style={{ marginTop: spacing[3] }}>
          You've moved past Stage 1. The remaining stages will land in
          a future release. Open the session on the web to continue
          for now.
        </Text>
        <Button
          title="Back to discovery"
          onPress={() => router.replace('/discovery' as any)}
          variant="ghost"
          size="lg"
          fullWidth
          style={{ marginTop: spacing[6] }}
        />
      </View>
    </ScreenContainer>
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
  heroIconWrap: {
    alignItems: 'center',
    marginTop: spacing[8],
    marginBottom: spacing[6],
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: spacing[3],
    paddingHorizontal: spacing[2],
  },
  sessionCard: {
    marginTop: spacing[6],
  },
  cta: {
    marginTop: spacing[8],
    gap: spacing[2],
  },
});
