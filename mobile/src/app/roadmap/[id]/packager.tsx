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

import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput as RNTextInput,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  Package,
  Copy,
  Check,
  Share2,
  Sparkles,
  MessageSquare,
  FileText,
  ArrowRight,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, Card, Button, Badge, ScreenContainer } from '@/components/ui';
import { spacing, radius, typography, iconSize } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types — mirror client/src/lib/roadmap/service-packager/schemas.ts
// ---------------------------------------------------------------------------

type BriefFormat = 'whatsapp' | 'document';

interface IncludedItem {
  item:        string;
  description: string;
}

interface PackageTier {
  name:          string;
  displayName:   string;
  price:         string;
  period:        string;
  description:   string;
  features:      string[];
  justification: string;
}

interface RevenueScenario {
  label:          string;
  clients:        number;
  tierMix:        string;
  monthlyRevenue: string;
  weeklyHours:    string;
  hiringNote?:    string;
}

interface ServicePackage {
  serviceName:      string;
  targetClient:     string;
  included:         IncludedItem[];
  notIncluded:      string[];
  tiers:            PackageTier[];
  revenueScenarios: RevenueScenario[];
  brief:            string;
  briefFormat:      BriefFormat;
}

interface ServiceContext {
  serviceSummary:        string;
  targetMarket:          string;
  competitorPricing?:    string;
  founderCosts?:         string;
  availableHoursPerWeek?: string;
  taskContext?:          string;
  researchFindings?:     string;
}

type Stage = 'confirm-context' | 'generating' | 'package' | 'adjusting';

const MAX_ADJUSTMENTS = 3;

const PROGRESS_MESSAGES = [
  'Shaping the service name…',
  'Defining tier boundaries…',
  'Pricing each tier against the market…',
  'Running the revenue scenarios…',
  'Writing the one-page brief…',
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

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
    if (adjustments >= MAX_ADJUSTMENTS) return;
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
              Elapsed {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · This takes about 60–90 seconds.
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

// ---------------------------------------------------------------------------
// ContextConfirmView — pre-populated summary the founder confirms or edits
// ---------------------------------------------------------------------------

interface ContextConfirmProps {
  context: ServiceContext | null;
  message: string;
  busy:    boolean;
  error:   string | null;
  onEdit:  (ctx: ServiceContext) => void;
  onConfirm: () => void;
}

function ContextConfirmView({
  context, message, busy, error, onEdit, onConfirm,
}: ContextConfirmProps) {
  const { colors: c } = useTheme();

  if (!context) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text variant="label" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
          Loading your context…
        </Text>
      </View>
    );
  }

  function editField(key: keyof ServiceContext, value: string) {
    onEdit({ ...context!, [key]: value });
  }

  return (
    <>
      <Text variant="title">Confirm your service</Text>
      {message ? (
        <Text variant="body" color={c.mutedForeground} style={{ marginTop: spacing[2], marginBottom: spacing[5] }}>
          {message}
        </Text>
      ) : null}

      <EditableField
        label="What you're packaging"
        value={context.serviceSummary}
        onChange={v => editField('serviceSummary', v)}
        minHeight={100}
      />
      <EditableField
        label="Who it's for"
        value={context.targetMarket}
        onChange={v => editField('targetMarket', v)}
      />

      {context.competitorPricing ? (
        <EditableField
          label="What competitors charge"
          value={context.competitorPricing}
          onChange={v => editField('competitorPricing', v)}
        />
      ) : null}

      {context.availableHoursPerWeek ? (
        <EditableField
          label="Your weekly hours"
          value={context.availableHoursPerWeek}
          onChange={v => editField('availableHoursPerWeek', v)}
        />
      ) : null}

      {context.researchFindings ? (
        <View style={[styles.researchFindings, { backgroundColor: c.secondaryAlpha10, borderColor: c.secondary }]}>
          <Text variant="overline" color={c.secondary}>From your Research Tool findings</Text>
          <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[2] }}>
            {context.researchFindings}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[3] }}>
          {error}
        </Text>
      ) : null}

      <Button
        title={busy ? 'Generating your package…' : 'Generate my package'}
        onPress={onConfirm}
        loading={busy}
        disabled={busy}
        size="lg"
        fullWidth
        icon={<Package size={iconSize.md} color={c.primaryForeground} />}
        style={{ marginTop: spacing[6] }}
      />
    </>
  );
}

function EditableField({
  label, value, onChange, minHeight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minHeight?: number;
}) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: spacing[4] }}>
      <Text variant="overline" color={c.mutedForeground} style={{ marginBottom: spacing[2] }}>
        {label}
      </Text>
      <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border }]}>
        <RNTextInput
          value={value}
          onChangeText={onChange}
          multiline
          maxLength={3000}
          style={[styles.input, { color: c.foreground, minHeight: minHeight ?? 60 }]}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PackageView — the rendered ServicePackage + adjust form + brief actions
// ---------------------------------------------------------------------------

interface PackageViewProps {
  pkg:                ServicePackage;
  adjustments:        number;
  adjustInstruction:  string;
  setAdjustInstruction: (s: string) => void;
  onAdjust:           () => void;
  onCopyBrief:        () => void;
  onShareBrief:       () => void;
  onBackToRoadmap:    () => void;
  busy:               boolean;
  error:              string | null;
}

function PackageView({
  pkg, adjustments, adjustInstruction, setAdjustInstruction,
  onAdjust, onCopyBrief, onShareBrief, onBackToRoadmap, busy, error,
}: PackageViewProps) {
  const { colors: c } = useTheme();
  const remaining = MAX_ADJUSTMENTS - adjustments;

  return (
    <>
      {/* Service name + target client — gold accent, this is the capstone */}
      <Card variant="primary" style={{ marginBottom: spacing[4] }}>
        <View style={styles.nameRow}>
          <Sparkles size={iconSize.md} color={c.secondary} />
          <Text variant="heading" color={c.foreground} style={{ flex: 1, marginLeft: spacing[2] }}>
            {pkg.serviceName}
          </Text>
        </View>
        <Text variant="body" color={c.mutedForeground} style={{ marginTop: spacing[3] }}>
          For {pkg.targetClient}
        </Text>
      </Card>

      {/* Tiers */}
      <Text variant="title" style={{ marginTop: spacing[4], marginBottom: spacing[3] }}>Pricing tiers</Text>
      <View style={{ gap: spacing[3] }}>
        {pkg.tiers.map((t, i) => (
          <Card key={i}>
            <View style={styles.tierHeader}>
              <Text variant="label">{t.displayName}</Text>
              <Badge label={t.name} variant="muted" />
            </View>
            <View style={styles.tierPrice}>
              <Text variant="heading" color={c.primary}>{t.price}</Text>
              <Text variant="caption" color={c.mutedForeground}>{t.period}</Text>
            </View>
            <Text variant="body" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
              {t.description}
            </Text>
            <View style={{ marginTop: spacing[3], gap: spacing[1] }}>
              {t.features.map((f, j) => (
                <View key={j} style={styles.featureRow}>
                  <Check size={iconSize.xs} color={c.success} />
                  <Text variant="caption" color={c.foreground} style={{ flex: 1 }}>{f}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.justification, { backgroundColor: c.muted }]}>
              <Text variant="caption" color={c.mutedForeground} style={{ fontStyle: 'italic' }}>
                {t.justification}
              </Text>
            </View>
          </Card>
        ))}
      </View>

      {/* Included */}
      <Text variant="title" style={{ marginTop: spacing[6], marginBottom: spacing[3] }}>What's included</Text>
      <Card>
        <View style={{ gap: spacing[3] }}>
          {pkg.included.map((item, i) => (
            <View key={i}>
              <Text variant="label">{item.item}</Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
                {item.description}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Not included */}
      {pkg.notIncluded.length > 0 && (
        <>
          <Text variant="title" style={{ marginTop: spacing[6], marginBottom: spacing[3] }}>Not included</Text>
          <Card variant="muted">
            <View style={{ gap: spacing[2] }}>
              {pkg.notIncluded.map((x, i) => (
                <Text key={i} variant="caption" color={c.mutedForeground}>
                  · {x}
                </Text>
              ))}
            </View>
          </Card>
        </>
      )}

      {/* Revenue scenarios */}
      <Text variant="title" style={{ marginTop: spacing[6], marginBottom: spacing[3] }}>Revenue scenarios</Text>
      <View style={{ gap: spacing[2] }}>
        {pkg.revenueScenarios.map((s, i) => (
          <Card key={i}>
            <View style={styles.scenarioHeader}>
              <Badge label={s.label} variant="primary" />
              <Text variant="label" color={c.primary}>{s.monthlyRevenue}</Text>
            </View>
            <Text variant="body" style={{ marginTop: spacing[2] }}>
              {s.clients} {s.clients === 1 ? 'client' : 'clients'} · {s.tierMix}
            </Text>
            <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
              {s.weeklyHours}
            </Text>
            {s.hiringNote ? (
              <Text variant="caption" color={c.warning} style={{ marginTop: spacing[1] }}>
                {s.hiringNote}
              </Text>
            ) : null}
          </Card>
        ))}
      </View>

      {/* Brief */}
      <Text variant="title" style={{ marginTop: spacing[6], marginBottom: spacing[3] }}>
        Your one-page brief
      </Text>
      <Card>
        <View style={styles.briefHeader}>
          {pkg.briefFormat === 'whatsapp'
            ? <MessageSquare size={iconSize.sm} color={c.mutedForeground} />
            : <FileText size={iconSize.sm} color={c.mutedForeground} />}
          <Text variant="caption" color={c.mutedForeground}>
            Formatted for {pkg.briefFormat === 'whatsapp' ? 'WhatsApp / SMS' : 'email or print'}
          </Text>
        </View>
        <Text variant="body" style={{ marginTop: spacing[3], lineHeight: 22 }}>
          {pkg.brief}
        </Text>
        <View style={styles.briefActions}>
          <Button
            title="Copy"
            onPress={onCopyBrief}
            variant="secondary"
            size="sm"
            icon={<Copy size={iconSize.sm} color={c.foreground} />}
          />
          <Button
            title="Share"
            onPress={onShareBrief}
            variant="ghost"
            size="sm"
            icon={<Share2 size={iconSize.sm} color={c.primary} />}
          />
        </View>
      </Card>

      {/* Adjustment form */}
      <View style={{ marginTop: spacing[6] }}>
        <Text variant="overline" color={c.mutedForeground}>
          Refine the package · {adjustments}/{MAX_ADJUSTMENTS} used
        </Text>
        {remaining > 0 ? (
          <>
            <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border, marginTop: spacing[2] }]}>
              <RNTextInput
                value={adjustInstruction}
                onChangeText={setAdjustInstruction}
                placeholder='e.g. "cheaper basic tier", "more premium features", "shorter brief"'
                placeholderTextColor={c.placeholder}
                multiline
                maxLength={1000}
                style={[styles.input, { color: c.foreground }]}
              />
            </View>
            <Button
              title={busy ? 'Refining…' : 'Refine'}
              onPress={onAdjust}
              loading={busy}
              disabled={!adjustInstruction.trim() || busy}
              size="md"
              fullWidth
              style={{ marginTop: spacing[2] }}
            />
          </>
        ) : (
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
            You've used all {MAX_ADJUSTMENTS} refinements. Start a new session if you need to rework the package from scratch.
          </Text>
        )}
        {error ? (
          <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[2] }}>
            {error}
          </Text>
        ) : null}
      </View>

      <Button
        title="Done — back to my roadmap"
        onPress={onBackToRoadmap}
        variant="secondary"
        size="md"
        fullWidth
        style={{ marginTop: spacing[6] }}
        icon={<ArrowRight size={iconSize.sm} color={c.foreground} />}
      />
    </>
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
    textAlignVertical: 'top',
  },
  researchFindings: {
    marginTop: spacing[4],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  tierPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  justification: {
    marginTop: spacing[3],
    padding: spacing[2.5],
    borderRadius: radius.md,
  },
  scenarioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  briefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  briefActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[4],
  },
});
