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

import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import { Text, Button, ScreenContainer } from '@/components/ui';
import { Stage2Placeholder } from '@/components/discovery/Stage2Placeholder';
import { StageBeyondPlaceholder } from '@/components/discovery/StageBeyondPlaceholder';
import { Stage2Chat } from '@/components/discovery/stage2/Stage2Chat';
import { RequirementsDocumentView } from '@/components/discovery/stage2/RequirementsDocumentView';
import {
  OutcomeDocumentView,
  type OutcomeDocument,
} from '@/components/discovery/OutcomeDocumentView';
import { Stage1ChatScreen } from '@/components/discovery/Stage1ChatScreen';
import type { Stage1Message } from '@/hooks/useStage1Session';
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
  //
  // Stage 2 routing (now live on mobile):
  //   - authoring                     → Stage2Chat (canvas + chat)
  //   - output_ready / committed      → RequirementsDocumentView
  //   - requirements failed to parse  → Stage2Chat with re-derive banner
  //                                     surfaced via requiresRederivation
  //                                     so the agent recomposes
  //   - missing authoring state (would only happen on a stale hydration
  //     race) → Stage2Placeholder bridge as a safety net
  //
  // Stages 3+ aren't on web yet — fall back to StageBeyondPlaceholder.
  if (hydration.active.stageNumber === 2) {
    if (hydration.active.status === 'authoring') {
      if (!hydration.stage2Authoring) {
        // The server's safeParseStage2AuthoringState normalises missing
        // rows into a fresh empty state, so this branch is defensive —
        // a stale hydration could still slip a null through.
        return <Stage2Placeholder sessionId={sessionId} />;
      }
      return (
        <Stage2Chat
          sessionId={sessionId}
          stageRunId={hydration.active.id}
          initialMessages={hydration.messages}
          inventory={hydration.stage2Authoring.workingInventory}
          hasExpectedProfile={
            (hydration.stage2Authoring.workingExpectedProfile?.length ?? 0) > 0
          }
          requiresRederivation={hydration.stage2Authoring.requiresRederivation}
          onSessionRefresh={loadSession}
        />
      );
    }

    // output_ready / committed. If the document JSON failed to parse,
    // route back into Stage2Chat — the agent can recompose against
    // the working inventory the same way Stage 1 does on
    // documentLoadError. The cascade snapshot (when present) carries
    // the prior document for a safe revert.
    if (hydration.requirementsLoadError || !hydration.requirements) {
      if (!hydration.stage2Authoring) {
        return <Stage2Placeholder sessionId={sessionId} />;
      }
      return (
        <Stage2Chat
          sessionId={sessionId}
          stageRunId={hydration.active.id}
          initialMessages={hydration.messages}
          inventory={hydration.stage2Authoring.workingInventory}
          hasExpectedProfile={false}
          requiresRederivation
          onSessionRefresh={loadSession}
        />
      );
    }

    return (
      <RequirementsDocumentView
        stageRunId={hydration.active.id}
        status={hydration.active.status as 'output_ready' | 'committed'}
        document={hydration.requirements}
        requiresRederivation={false}
        onAfterAction={loadSession}
      />
    );
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
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
  },
});
