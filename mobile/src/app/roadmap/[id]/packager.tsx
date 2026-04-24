// src/app/roadmap/[id]/packager.tsx
//
// Service Packager — task-level. Produces a one-page service brief
// (name + target + included/not + tiered pricing + revenue scenarios +
// the brief text) that the founder sends to prospects.
//
// Four-stage state machine:
//   confirm-context → confirmPhase() exchanges (0-2 turns) → generate
//   generating      → Opus call, shows progress copy (~60-90s)
//   package         → render sections + adjust form
//   adjusting       → refinement call, up to MAX_ADJUSTMENTS rounds
//
// Backend routes — task-level when taskId present, otherwise standalone:
//   POST /api/discovery/roadmaps/[id][/tasks/[taskId]]/packager/generate
//     Two shapes accepted:
//       { message }                  → context-confirmation turn
//                                      → { status:'need_context'|'ready',
//                                          message, context, sessionId }
//       { context: ServiceContext }  → generation
//                                      → { package, sessionId }
//   POST /api/discovery/roadmaps/[id][/tasks/[taskId]]/packager/adjust
//     { instruction, sessionId }     → { package, round,
//                                        adjustmentsRemaining }
//
// Presentational concerns live in @/components/packager/* so this file
// stays focused on the state machine and API surface.

import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Share } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, ScreenContainer } from '@/components/ui';
import { spacing } from '@/constants/theme';
import {
  ContextConfirmView,
  PackageView,
  type ServicePackage,
  type ServiceContext,
} from '@/components/packager';
import { ToolSessionHistoryButton, type ToolSessionRow } from '@/components/tools/ToolSessionHistoryButton';

interface PackagerSessionListRow {
  id:               string;
  serviceName:      string;
  targetClient:     string;
  createdAt:        string;
  updatedAt:        string;
  tierCount:        number;
  adjustmentRounds: number;
}

type Stage = 'confirm-context' | 'generating' | 'package' | 'adjusting';

const PROGRESS_MESSAGES = [
  'Shaping the service name…',
  'Defining tier boundaries…',
  'Pricing each tier against the market…',
  'Running the revenue scenarios…',
  'Writing the one-page brief…',
];

export default function PackagerScreen() {
  const { id: roadmapId, taskId } = useLocalSearchParams<{ id: string; taskId?: string }>();
  const { colors: c } = useTheme();
  const router = useRouter();

  const [stage, setStage]       = useState<Stage>('confirm-context');
  const [context, setContext]   = useState<ServiceContext | null>(null);
  const [message, setMessage]   = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [pkg, setPackage]       = useState<ServicePackage | null>(null);
  const [adjustments, setAdjustments] = useState<number>(0);
  const [adjustInstruction, setAdjustInstruction] = useState('');

  const [progressIdx, setProgressIdx] = useState(0);
  const [elapsed, setElapsed]   = useState(0);
  const startedAt = useRef<number | null>(null);

  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Session history — standalone entry only (task-scoped has one session
  // per task). List endpoint returns the founder's recent packages for
  // this roadmap so output doesn't vanish on navigation.
  const sessionsSwr = useSWR<{ sessions: PackagerSessionListRow[] }>(
    !taskId ? `/api/discovery/roadmaps/${roadmapId}/packager/sessions` : null,
    (url: string) => api<{ sessions: PackagerSessionListRow[] }>(url),
  );
  const historyRows: ToolSessionRow[] | null = sessionsSwr.data
    ? sessionsSwr.data.sessions.map(s => ({
        id:        s.id,
        title:     s.serviceName,
        subtitle:  `${s.targetClient} · ${s.tierCount} tier${s.tierCount === 1 ? '' : 's'}`,
        updatedAt: s.updatedAt,
      }))
    : null;

  // Rotate progress messages during long-running generation
  useEffect(() => {
    if (stage !== 'generating' && stage !== 'adjusting') return;
    startedAt.current = Date.now();
    const tick = setInterval(() => {
      setProgressIdx(i => (i + 1) % PROGRESS_MESSAGES.length);
      setElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    }, 4000);
    return () => clearInterval(tick);
  }, [stage]);

  // Fetch initial context on mount — server pre-populates from task
  useEffect(() => {
    void initialContextFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function basePath(suffix: 'generate' | 'adjust'): string {
    return taskId
      ? `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/packager/${suffix}`
      : `/api/discovery/roadmaps/${roadmapId}/packager/${suffix}`;
  }

  async function handleRestoreSession(restoreId: string) {
    setRestoring(true);
    setError(null);
    try {
      const data = await api<{ package: ServicePackage; context: ServiceContext }>(
        `/api/discovery/roadmaps/${roadmapId}/packager/sessions/${restoreId}`,
      );
      // Re-hydrate the state machine as if generation had just
      // completed: sessionId is the restored one so refine still works,
      // adjustments reset to 0 because the endpoint doesn't surface the
      // count (the server still enforces MAX_ADJUSTMENTS on the
      // persisted session).
      setContext(data.context);
      setPackage(data.package);
      setSessionId(restoreId);
      setStage('package');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not restore that package.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRestoring(false);
    }
  }

  async function initialContextFetch() {
    try {
      setBusy(true);
      const data = await api<{
        status:  'need_context' | 'ready';
        message: string;
        context: ServiceContext;
        sessionId: string;
      }>(basePath('generate'), {
        method: 'POST',
        body: { message: 'Start the packager.' },
      });
      setContext(data.context);
      setMessage(data.message);
      setSessionId(data.sessionId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the packager context.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmAndGenerate() {
    if (!context || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    setStage('generating');
    try {
      const data = await api<{ package: ServicePackage; sessionId: string }>(
        basePath('generate'),
        { method: 'POST', body: { context, sessionId } },
      );
      setPackage(data.package);
      setSessionId(data.sessionId);
      setStage('package');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the package.');
      setStage('confirm-context');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjust() {
    if (!sessionId || !adjustInstruction.trim() || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setError(null);
    setStage('adjusting');
    try {
      const data = await api<{
        package: ServicePackage;
        round: number;
        adjustmentsRemaining: number;
      }>(basePath('adjust'), {
        method: 'POST',
        body: { instruction: adjustInstruction.trim(), sessionId },
      });
      setPackage(data.package);
      setAdjustments(data.round);
      setAdjustInstruction('');
      setStage('package');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not refine the package.');
      setStage('package');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  async function copyBrief() {
    if (!pkg) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(pkg.brief);
  }

  async function shareBrief() {
    if (!pkg) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: pkg.brief,
        title:   pkg.serviceName,
      });
    } catch { /* cancelled */ }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Service Packager',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
          headerRight: () => (
            <ToolSessionHistoryButton
              rows={historyRows}
              title="Recent packages"
              onSelect={(id) => { void handleRestoreSession(id); }}
              restoring={restoring}
            />
          ),
        }}
      />
      <ScreenContainer keyboardAvoid>
        {stage === 'confirm-context' && (
          <ContextConfirmView
            context={context}
            message={message}
            busy={busy}
            error={error}
            onEdit={setContext}
            onConfirm={handleConfirmAndGenerate}
          />
        )}

        {stage === 'generating' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text variant="label" color={c.foreground} style={{ marginTop: spacing[4] }}>
              {PROGRESS_MESSAGES[progressIdx]}
            </Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
              Elapsed {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </Text>
          </View>
        )}

        {stage === 'adjusting' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text variant="label" color={c.foreground} style={{ marginTop: spacing[4] }}>
              Refining…
            </Text>
          </View>
        )}

        {stage === 'package' && pkg && (
          <PackageView
            pkg={pkg}
            adjustments={adjustments}
            adjustInstruction={adjustInstruction}
            setAdjustInstruction={setAdjustInstruction}
            onAdjust={handleAdjust}
            onCopyBrief={copyBrief}
            onShareBrief={shareBrief}
            onBackToRoadmap={() => router.replace(`/roadmap/${roadmapId}`)}
            busy={busy}
            error={error}
          />
        )}
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing[10],
    paddingHorizontal: spacing[6],
  },
});
