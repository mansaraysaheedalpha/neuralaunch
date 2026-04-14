// src/app/roadmap/[id]/research.tsx
//
// Research Tool — task-level. State machine through five phases:
//   input        → founder types/edits a query
//   planning     → POST /research/plan; brief loading state
//   plan-review  → editable plan textarea; founder approves or revises
//   executing    → POST /research/execute; long-running, progress UI
//   report       → ResearchReport renders with findings + follow-up input
//
// Same routes as web (POST .../tasks/[taskId]/research/{plan,execute,
// followup}) — backend already exists.

import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput as RNTextInput,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  Search,
  Edit3,
  ExternalLink,
  Copy,
  Check,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import {
  Text,
  Card,
  Button,
  Badge,
  ScreenContainer,
} from '@/components/ui';
import { spacing, radius, typography, iconSize } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types — mirror the backend ResearchReport schema
// ---------------------------------------------------------------------------

type FindingType = 'business' | 'person' | 'competitor' | 'datapoint' | 'regulation' | 'tool' | 'insight';
type Confidence  = 'verified' | 'likely' | 'unverified';
type SuggestedTool = 'conversation_coach' | 'outreach_composer' | 'service_packager';

interface SocialMedia {
  platform: string;
  handle:   string;
  url:      string;
}

interface ContactInfo {
  website?:         string;
  phone?:           string;
  email?:           string;
  socialMedia?:     SocialMedia[];
  physicalAddress?: string;
}

interface Finding {
  title:        string;
  description:  string;
  type:         FindingType;
  location?:    string;
  contactInfo?: ContactInfo;
  sourceUrl:    string;
  confidence:   Confidence;
}

interface Source {
  title:     string;
  url:       string;
  relevance: string;
}

interface NextStep {
  action:         string;
  suggestedTool?: SuggestedTool;
  toolContext?:   string;
}

interface ResearchReport {
  summary:             string;
  findings:            Finding[];
  sources:             Source[];
  roadmapConnections?: string;
  suggestedNextSteps?: NextStep[];
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

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ResearchToolScreen() {
  const { id: roadmapId, taskId, q } = useLocalSearchParams<{
    id: string;
    taskId?: string;
    q?: string; // optional pre-populated suggested query
  }>();
  const { colors: c } = useTheme();
  const router = useRouter();

  const [stage, setStage]       = useState<Stage>('input');
  const [query, setQuery]       = useState(q ?? '');
  const [plan, setPlan]         = useState('');
  const [eta, setEta]           = useState('');
  const [report, setReport]     = useState<ResearchReport | null>(null);
  const [followUps, setFollowUps] = useState<Array<{ query: string; findings: Finding[]; round: number }>>([]);
  const [followUpQuery, setFollowUpQuery] = useState('');
  const [progressIdx, setProgressIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);

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
    }
    // service_packager isn't built on mobile yet — silently ignore
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
        }}
      />
      <ScreenContainer keyboardAvoid>
        {/* Stage: input */}
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

        {/* Stage: planning */}
        {stage === 'planning' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
              Drafting a research plan…
            </Text>
          </View>
        )}

        {/* Stage: plan-review */}
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

        {/* Stage: executing */}
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

        {/* Stage: report */}
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

// ---------------------------------------------------------------------------
// Report view — extracted to keep the orchestrator small
// ---------------------------------------------------------------------------

interface ReportProps {
  report:          ResearchReport;
  followUps:       Array<{ query: string; findings: Finding[]; round: number }>;
  followUpQuery:   string;
  setFollowUpQuery: (s: string) => void;
  onFollowUp:      () => void;
  onNextStep:      (s: NextStep) => void;
  busy:            boolean;
  error:           string | null;
}

function ReportView({
  report,
  followUps,
  followUpQuery,
  setFollowUpQuery,
  onFollowUp,
  onNextStep,
  busy,
  error,
}: ReportProps) {
  const { colors: c } = useTheme();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const followUpsRemaining = 5 - followUps.length;

  return (
    <>
      {/* Summary */}
      <Card variant="primary" style={{ marginBottom: spacing[4] }}>
        <Text variant="overline" color={c.primary}>Summary</Text>
        <Text variant="body" style={{ marginTop: spacing[2] }}>{report.summary}</Text>
      </Card>

      {/* Findings */}
      <Text variant="title" style={{ marginBottom: spacing[3] }}>
        Findings ({report.findings.length})
      </Text>
      <View style={{ gap: spacing[3] }}>
        {report.findings.map((f, i) => <FindingCard key={i} finding={f} />)}
      </View>

      {/* Roadmap connections — gold callout */}
      {report.roadmapConnections && (
        <Card style={[styles.connectionsCallout, { backgroundColor: c.secondaryAlpha10, borderColor: c.secondary }]}>
          <Text variant="overline" color={c.secondary}>Connections to your roadmap</Text>
          <Text variant="body" style={{ marginTop: spacing[2] }}>
            {report.roadmapConnections}
          </Text>
        </Card>
      )}

      {/* Suggested next steps */}
      {report.suggestedNextSteps && report.suggestedNextSteps.length > 0 && (
        <View style={{ marginTop: spacing[6] }}>
          <Text variant="title" style={{ marginBottom: spacing[3] }}>Next steps</Text>
          <View style={{ gap: spacing[2] }}>
            {report.suggestedNextSteps.map((s, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={s.action}
                onPress={() => onNextStep(s)}
                disabled={!s.suggestedTool}
              >
                <Card>
                  <View style={styles.nextStepRow}>
                    <Text variant="body" style={{ flex: 1 }}>{s.action}</Text>
                    {s.suggestedTool && <ArrowRight size={iconSize.sm} color={c.primary} />}
                  </View>
                  {s.suggestedTool && (
                    <Text variant="caption" color={c.primary} style={{ marginTop: spacing[1] }}>
                      Open {s.suggestedTool === 'conversation_coach' ? 'Conversation Coach' : s.suggestedTool === 'outreach_composer' ? 'Outreach Composer' : s.suggestedTool}
                    </Text>
                  )}
                </Card>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Sources — collapsible */}
      <View style={{ marginTop: spacing[6] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sourcesOpen ? 'Hide sources' : `Show sources (${report.sources.length})`}
          onPress={() => setSourcesOpen(v => !v)}
          style={styles.sourcesToggle}
        >
          {sourcesOpen
            ? <ChevronUp size={iconSize.sm} color={c.mutedForeground} />
            : <ChevronDown size={iconSize.sm} color={c.mutedForeground} />}
          <Text variant="label" color={c.mutedForeground}>
            {sourcesOpen ? 'Hide' : 'Show'} sources ({report.sources.length})
          </Text>
        </Pressable>
        {sourcesOpen && (
          <View style={styles.sourcesList}>
            {report.sources.map((s, i) => (
              <Pressable
                key={i}
                accessibilityRole="link"
                accessibilityLabel={`Open source: ${s.title}`}
                onPress={() => void Linking.openURL(s.url)}
                style={styles.sourceRow}
              >
                <ExternalLink size={iconSize.xs} color={c.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color={c.primary}>{s.title}</Text>
                  <Text variant="caption" color={c.mutedForeground} numberOfLines={1}>
                    {s.relevance}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Follow-ups */}
      {followUps.length > 0 && (
        <View style={{ marginTop: spacing[6] }}>
          <Text variant="title">Follow-ups</Text>
          {followUps.map((fu, i) => (
            <View key={i} style={{ marginTop: spacing[3] }}>
              <Text variant="caption" color={c.mutedForeground}>
                Round {fu.round}: <Text color={c.foreground} variant="caption">{fu.query}</Text>
              </Text>
              <View style={{ marginTop: spacing[2], gap: spacing[2] }}>
                {fu.findings.map((f, j) => <FindingCard key={j} finding={f} />)}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Follow-up input */}
      <View style={{ marginTop: spacing[6] }}>
        <Text variant="overline" color={c.mutedForeground}>
          Ask a follow-up · {followUps.length}/5 used
        </Text>
        {followUpsRemaining > 0 ? (
          <>
            <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border, marginTop: spacing[2] }]}>
              <RNTextInput
                value={followUpQuery}
                onChangeText={setFollowUpQuery}
                placeholder="e.g. Tell me more about the third one"
                placeholderTextColor={c.placeholder}
                multiline
                maxLength={3000}
                style={[styles.input, { color: c.foreground }]}
              />
            </View>
            <Button
              title={busy ? 'Researching…' : 'Ask'}
              onPress={onFollowUp}
              loading={busy}
              disabled={!followUpQuery.trim() || busy}
              size="md"
              fullWidth
              style={{ marginTop: spacing[2] }}
            />
            {error && (
              <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[2] }}>
                {error}
              </Text>
            )}
          </>
        ) : (
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
            You've used all 5 follow-ups for this session. Start a new research session for deeper investigation.
          </Text>
        )}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Finding card — adapts to the finding type
// ---------------------------------------------------------------------------

const CONFIDENCE_VARIANT: Record<Confidence, 'success' | 'warning' | 'destructive'> = {
  verified:   'success',
  likely:     'warning',
  unverified: 'destructive',
};

function FindingCard({ finding: f }: { finding: Finding }) {
  const { colors: c } = useTheme();
  const [copied, setCopied] = useState(false);

  const contactStrings: string[] = [];
  if (f.contactInfo?.website)         contactStrings.push(f.contactInfo.website);
  if (f.contactInfo?.phone)           contactStrings.push(f.contactInfo.phone);
  if (f.contactInfo?.email)           contactStrings.push(f.contactInfo.email);
  if (f.contactInfo?.physicalAddress) contactStrings.push(f.contactInfo.physicalAddress);

  async function copyContacts() {
    if (contactStrings.length === 0) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(contactStrings.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <View style={styles.findingHeader}>
        <Badge label={f.type} variant="muted" />
        <Badge label={f.confidence} variant={CONFIDENCE_VARIANT[f.confidence]} />
      </View>
      <Text variant="label" style={{ marginTop: spacing[2] }}>{f.title}</Text>
      {f.location && (
        <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
          {f.location}
        </Text>
      )}
      <Text variant="body" style={{ marginTop: spacing[2] }}>{f.description}</Text>

      {/* Contact info */}
      {contactStrings.length > 0 && (
        <View style={[styles.contactBox, { backgroundColor: c.muted }]}>
          {f.contactInfo?.website && (
            <Pressable onPress={() => void Linking.openURL(f.contactInfo!.website!)}>
              <Text variant="caption" color={c.primary}>{f.contactInfo.website}</Text>
            </Pressable>
          )}
          {f.contactInfo?.phone && (
            <Text variant="caption" color={c.foreground}>{f.contactInfo.phone}</Text>
          )}
          {f.contactInfo?.email && (
            <Text variant="caption" color={c.foreground}>{f.contactInfo.email}</Text>
          )}
          {f.contactInfo?.physicalAddress && (
            <Text variant="caption" color={c.foreground}>{f.contactInfo.physicalAddress}</Text>
          )}
          {f.contactInfo?.socialMedia?.map((s, i) => (
            <Pressable key={i} onPress={() => void Linking.openURL(s.url)}>
              <Text variant="caption" color={c.primary}>{s.platform}: {s.handle}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Copied contact info' : 'Copy contact info'}
            onPress={() => { void copyContacts(); }}
            style={styles.copyChip}
          >
            {copied ? <Check size={iconSize.xs} color={c.success} /> : <Copy size={iconSize.xs} color={c.mutedForeground} />}
            <Text variant="caption" color={c.mutedForeground}>
              {copied ? 'Copied' : 'Copy contact'}
            </Text>
          </Pressable>
        </View>
      )}

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open source"
        onPress={() => void Linking.openURL(f.sourceUrl)}
        style={styles.sourceLink}
      >
        <ExternalLink size={iconSize.xs} color={c.primary} />
        <Text variant="caption" color={c.primary}>Source</Text>
      </Pressable>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  findingHeader: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  contactBox: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    gap: spacing[1],
  },
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[2],
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[3],
  },
  connectionsCallout: {
    marginTop: spacing[6],
    borderWidth: 1,
  },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  sourcesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
  },
  sourcesList: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[1.5],
  },
});

