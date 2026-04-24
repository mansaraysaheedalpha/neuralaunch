// src/app/roadmap/[id]/research.tsx
//
// Research Tool — task-level. State machine through five phases:
//   input        → founder types/edits a query
//   planning     → POST /research/plan; brief loading state
//   plan-review  → editable plan textarea; founder approves or revises
//   executing    → POST /research/execute; long-running, progress UI
//   report       → ReportView renders with findings + follow-up input
//
// Same routes as web (POST .../tasks/[taskId]/research/{plan,execute,
// followup}) — backend already exists.
//
// Presentational concerns (ReportView, FindingCard) live in
// @/components/research/* so this file stays focused on the state
// machine and API surface.

import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput as RNTextInput,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import useSWR from 'swr';
import { Search, Edit3 } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, Button, ScreenContainer } from '@/components/ui';
import { spacing, radius, typography, iconSize } from '@/constants/theme';
import {
  ReportView,
  type Finding,
  type FollowUpRound,
  type NextStep,
  type ResearchReport,
} from '@/components/research';
import { ToolSessionHistoryButton, type ToolSessionRow } from '@/components/tools/ToolSessionHistoryButton';

interface ResearchSessionListRow {
  id:            string;
  query:         string;
  createdAt:     string;
  updatedAt:     string;
  hasReport:     boolean;
  followUpCount: number;
}

interface ResearchSessionDetail {
  id:        string;
  query:     string;
  plan?:     string;
  report?:   ResearchReport;
  followUps?: FollowUpRound[];
}

type Stage = 'input' | 'planning' | 'plan-review' | 'executing' | 'report';

const PROGRESS_MESSAGES = [
  'Searching across business directories…',
  'Cross-referencing public records…',
  'Reading customer reviews…',
  'Filling in pricing and contact information…',
  'Connecting findings to your roadmap…',
  'Compiling the report…',
];

export default function ResearchToolScreen() {
  const { id: roadmapId, taskId, q } = useLocalSearchParams<{
    id: string;
    taskId?: string;
    q?: string;
  }>();
  const { colors: c } = useTheme();
  const router = useRouter();

  const [stage, setStage]       = useState<Stage>('input');
  const [query, setQuery]       = useState(q ?? '');
  const [plan, setPlan]         = useState('');
  const [eta, setEta]           = useState('');
  const [report, setReport]     = useState<ResearchReport | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpRound[]>([]);
  const [followUpQuery, setFollowUpQuery] = useState('');
  const [progressIdx, setProgressIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const startedAt = useRef<number | null>(null);

  // Session history — standalone entry only.
  const sessionsSwr = useSWR<{ sessions: ResearchSessionListRow[] }>(
    !taskId ? `/api/discovery/roadmaps/${roadmapId}/research/sessions` : null,
    (url: string) => api<{ sessions: ResearchSessionListRow[] }>(url),
  );
  const historyRows: ToolSessionRow[] | null = sessionsSwr.data
    ? sessionsSwr.data.sessions.map(s => ({
        id:        s.id,
        title:     s.query,
        subtitle:  s.hasReport
          ? `Report ready${s.followUpCount > 0 ? ` · ${s.followUpCount} follow-up${s.followUpCount === 1 ? '' : 's'}` : ''}`
          : 'Plan only',
        updatedAt: s.updatedAt,
      }))
    : null;

  async function handleRestoreSession(restoreId: string) {
    setRestoring(true);
    setError(null);
    try {
      const data = await api<{ session: ResearchSessionDetail }>(
        `/api/discovery/roadmaps/${roadmapId}/research/sessions/${restoreId}`,
      );
      const s = data.session;
      setQuery(s.query);
      setPlan(s.plan ?? '');
      setReport(s.report ?? null);
      setFollowUps(s.followUps ?? []);
      // Land on the furthest stage the persisted session reached.
      const nextStage: Stage = s.report
        ? 'report'
        : s.plan
          ? 'plan-review'
          : 'input';
      setStage(nextStage);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not restore that research.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRestoring(false);
    }
  }

  // Live "what the agent is doing" indicator while executing
  useEffect(() => {
    if (stage !== 'executing') return;
    startedAt.current = Date.now();
    const tick = setInterval(() => {
      setProgressIdx(i => (i + 1) % PROGRESS_MESSAGES.length);
      setElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    }, 4000);
    return () => clearInterval(tick);
  }, [stage]);

  function basePath(suffix: 'plan' | 'execute' | 'followup'): string {
    return taskId
      ? `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/research/${suffix}`
      : `/api/discovery/roadmaps/${roadmapId}/research/${suffix}`;
  }

  async function handlePlan() {
    if (!query.trim() || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setError(null);
    setStage('planning');
    try {
      const data = await api<{ plan: string; estimatedTime?: string }>(
        basePath('plan'),
        { method: 'POST', body: { query: query.trim() } },
      );
      setPlan(data.plan);
      setEta(data.estimatedTime ?? '');
      setStage('plan-review');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate the research plan.');
      setStage('input');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  async function handleExecute() {
    if (!plan.trim() || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    setStage('executing');
    try {
      const data = await api<{ report: ResearchReport }>(
        basePath('execute'),
        { method: 'POST', body: { plan: plan.trim() } },
      );
      setReport(data.report);
      setStage('report');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run the research.');
      setStage('plan-review');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  async function handleFollowUp() {
    if (!followUpQuery.trim() || busy || followUps.length >= 5) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ findings: Finding[]; round: number }>(
        basePath('followup'),
        { method: 'POST', body: { query: followUpQuery.trim() } },
      );
      setFollowUps(prev => [...prev, { query: followUpQuery.trim(), findings: data.findings, round: data.round }]);
      setFollowUpQuery('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run the follow-up.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  function handleNextStep(step: NextStep) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!step.suggestedTool) return;
    if (step.suggestedTool === 'conversation_coach') {
      router.push(taskId
        ? `/roadmap/${roadmapId}/coach?taskId=${taskId}`
        : `/roadmap/${roadmapId}/coach`);
    } else if (step.suggestedTool === 'outreach_composer') {
      router.push(taskId
        ? `/roadmap/${roadmapId}/outreach?taskId=${taskId}`
        : `/roadmap/${roadmapId}/outreach`);
    } else if (step.suggestedTool === 'service_packager') {
      router.push(taskId
        ? `/roadmap/${roadmapId}/packager?taskId=${taskId}`
        : `/roadmap/${roadmapId}/packager`);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Research Tool',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
          headerRight: () => (
            <ToolSessionHistoryButton
              rows={historyRows}
              title="Recent research"
              onSelect={(id) => { void handleRestoreSession(id); }}
              restoring={restoring}
            />
          ),
        }}
      />
      <ScreenContainer keyboardAvoid>
        {stage === 'input' && (
          <>
            <Text variant="title">What do you need to know?</Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1], marginBottom: spacing[5] }}>
              Ask in plain language — businesses to find, regulations to check, competitors to compare, prices to verify. The agent figures out the rest.
            </Text>
            <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border }]}>
              <RNTextInput
                value={query}
                onChangeText={setQuery}
                placeholder="e.g. Find restaurant owners in Accra who might need commercial laundry services"
                placeholderTextColor={c.placeholder}
                multiline
                maxLength={3000}
                style={[styles.input, { color: c.foreground }]}
              />
            </View>
            <Button
              title="Plan my research"
              onPress={handlePlan}
              disabled={!query.trim()}
              size="lg"
              fullWidth
              icon={<Search size={iconSize.md} color={c.primaryForeground} />}
              style={{ marginTop: spacing[4] }}
            />
            {error && (
              <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[3] }}>
                {error}
              </Text>
            )}
          </>
        )}

        {stage === 'planning' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
              Drafting a research plan…
            </Text>
          </View>
        )}

        {stage === 'plan-review' && (
          <>
            <Text variant="title">Here's the plan</Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1], marginBottom: spacing[4] }}>
              Edit anything below — add angles, narrow scope, or rewrite the plan. The agent will follow your edits.
            </Text>
            <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border, minHeight: 180 }]}>
              <RNTextInput
                value={plan}
                onChangeText={setPlan}
                multiline
                maxLength={5000}
                style={[styles.input, { color: c.foreground }]}
              />
            </View>
            {eta && (
              <View style={styles.etaRow}>
                <Edit3 size={iconSize.xs} color={c.mutedForeground} />
                <Text variant="caption" color={c.mutedForeground}>
                  {eta}
                </Text>
              </View>
            )}
            <Button
              title="Start research"
              onPress={handleExecute}
              size="lg"
              fullWidth
              style={{ marginTop: spacing[4] }}
            />
            <Button
              title="Back to query"
              onPress={() => setStage('input')}
              variant="ghost"
              size="md"
              fullWidth
              style={{ marginTop: spacing[2] }}
            />
            {error && (
              <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[3] }}>
                {error}
              </Text>
            )}
          </>
        )}

        {stage === 'executing' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text variant="label" color={c.foreground} style={{ marginTop: spacing[4] }}>
              {PROGRESS_MESSAGES[progressIdx]}
            </Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
              Elapsed {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · Deep research takes 2–6 minutes
            </Text>
          </View>
        )}

        {stage === 'report' && report && (
          <ReportView
            report={report}
            followUps={followUps}
            followUpQuery={followUpQuery}
            setFollowUpQuery={setFollowUpQuery}
            onFollowUp={handleFollowUp}
            onNextStep={handleNextStep}
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
  textArea: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[3],
  },
  input: {
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.leading.relaxed,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[2],
  },
});
