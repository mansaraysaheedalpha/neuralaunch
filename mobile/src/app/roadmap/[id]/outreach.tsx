// src/app/roadmap/[id]/outreach.tsx
//
// Outreach Composer — 3-mode version per the spec.
//
// Flow:
//   context-form → generating → output
//
// Context form collects: target description, relationship, goal
// (required), optional prior interaction / recipient name, channel
// (whatsapp | email | linkedin), mode (single | batch | sequence).
//
// Output view dispatches on mode:
//   single   — one ComposerMessageCard, full width
//   batch    — 5-10 cards with personalisation hooks
//   sequence — 3 cards (Day 1 / Day 5 / Day 14) with escalation notes
//
// Each card owns regenerate (max 2 variations) + mark-sent + native
// share + copy + Coach handoff when suggestedTool present.

import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput as RNTextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Send } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api, ApiError } from '@/services/api-client';
import { Text, Card, Button, ScreenContainer } from '@/components/ui';
import {
  ComposerMessageCard,
  type ComposerMessage,
  type ComposerVariation,
} from '@/components/outreach/ComposerMessageCard';
import { buildCoachSeedFromComposerMessage } from '@/components/outreach/buildCoachSeed';
import { spacing, radius, typography, iconSize } from '@/constants/theme';

type Channel = 'whatsapp' | 'email' | 'linkedin';
type Mode    = 'single' | 'batch' | 'sequence';

interface ComposerOutput {
  messages: ComposerMessage[];
}

const CHANNELS: Array<{ id: Channel; label: string }> = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email',    label: 'Email' },
  { id: 'linkedin', label: 'LinkedIn' },
];

const MODES: Array<{ id: Mode; title: string; copy: string }> = [
  { id: 'single',   title: 'One specific person',        copy: 'A single ready-to-send message for a named recipient.' },
  { id: 'batch',    title: 'Many similar people',        copy: '5-10 personalised variations to reach a whole list.' },
  { id: 'sequence', title: 'A follow-up sequence',       copy: 'Day 1, Day 5, Day 14 — escalates if nobody replies.' },
];

export default function OutreachComposerScreen() {
  const { id: roadmapId, taskId } = useLocalSearchParams<{ id: string; taskId?: string }>();
  const { colors: c } = useTheme();
  const router = useRouter();

  // Form state
  const [channel, setChannel] = useState<Channel | null>(null);
  const [mode, setMode]       = useState<Mode | null>(null);
  const [target, setTarget]       = useState('');
  const [relationship, setRelationship] = useState('');
  const [goal, setGoal]           = useState('');
  const [priorInteraction, setPriorInteraction] = useState('');

  // Output state
  const [output, setOutput]       = useState<ComposerOutput | null>(null);
  const [sentIds, setSentIds]     = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate =
    channel !== null &&
    mode !== null &&
    target.trim().length > 0 &&
    relationship.trim().length > 0 &&
    goal.trim().length > 0 &&
    !generating;

  function basePath(suffix: 'generate' | 'regenerate' | 'mark-sent'): string {
    return taskId
      ? `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer/${suffix}`
      : `/api/discovery/roadmaps/${roadmapId}/composer/${suffix}`;
  }

  async function handleGenerate() {
    if (!canGenerate || !roadmapId) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerating(true);
    setError(null);
    try {
      const data = await api<{ output: ComposerOutput }>(
        basePath('generate'),
        {
          method: 'POST',
          body: {
            context: {
              targetDescription: target.trim(),
              relationship:      relationship.trim(),
              goal:              goal.trim(),
              ...(priorInteraction.trim() ? { priorInteraction: priorInteraction.trim() } : {}),
            },
            mode,
            channel,
          },
        },
      );
      setOutput(data.output);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate. Try again.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGenerating(false);
    }
  }

  const handleRegenerate = useCallback(
    async (messageId: string, instruction: string) => {
      try {
        const data = await api<{ variation: ComposerVariation }>(
          basePath('regenerate'),
          { method: 'POST', body: { messageId, instruction } },
        );
        setOutput(prev => prev ? {
          messages: prev.messages.map(m =>
            m.id === messageId
              ? { ...m, variations: [...(m.variations ?? []), data.variation] }
              : m
          ),
        } : prev);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not rewrite.');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [roadmapId, taskId],
  );

  const handleMarkSent = useCallback(
    async (messageId: string, sent: boolean) => {
      // Optimistic local update
      setSentIds(prev => {
        const next = new Set(prev);
        sent ? next.add(messageId) : next.delete(messageId);
        return next;
      });
      if (!sent) return; // only server-record "sent"; un-toggle is local for now
      try {
        await api(basePath('mark-sent'), { method: 'POST', body: { messageId } });
      } catch {
        // Roll back on failure
        setSentIds(prev => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      }
    },
    [roadmapId, taskId],
  );

  function handleCoachHandoff(m: ComposerMessage) {
    // Mirrors the web's composer→coach handoff: pass the drafted
    // message's context into Coach setup so the founder doesn't
    // retype it. Seed is built client-side from data we already
    // have (message + channel + goal + targetDescription) so no
    // standalone-sessions endpoint is required on mobile.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const seed = buildCoachSeedFromComposerMessage({
      message: m,
      channel: channel ?? '',
      context: { goal, targetDescription: target },
    });
    const encodedSeed = encodeURIComponent(seed);
    const query = taskId
      ? `taskId=${taskId}&coachSeed=${encodedSeed}`
      : `coachSeed=${encodedSeed}`;
    router.push(`/roadmap/${roadmapId}/coach?${query}`);
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Outreach Composer',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer keyboardAvoid>
        {output ? (
          <OutputView
            output={output}
            mode={mode ?? 'single'}
            sentIds={sentIds}
            onMarkSent={handleMarkSent}
            onRegenerate={handleRegenerate}
            onCoachHandoff={handleCoachHandoff}
            onStartOver={() => {
              setOutput(null);
              setSentIds(new Set());
            }}
            onBackToRoadmap={() => router.replace(`/roadmap/${roadmapId}`)}
          />
        ) : (
          <FormView
            target={target} setTarget={setTarget}
            relationship={relationship} setRelationship={setRelationship}
            goal={goal} setGoal={setGoal}
            priorInteraction={priorInteraction} setPriorInteraction={setPriorInteraction}
            channel={channel} setChannel={setChannel}
            mode={mode} setMode={setMode}
            canGenerate={canGenerate}
            generating={generating}
            error={error}
            onGenerate={handleGenerate}
          />
        )}
      </ScreenContainer>
    </>
  );
}

// ---------------------------------------------------------------------------
// FormView — context + mode + channel + generate button
// ---------------------------------------------------------------------------

interface FormProps {
  target: string;           setTarget: (s: string) => void;
  relationship: string;     setRelationship: (s: string) => void;
  goal: string;             setGoal: (s: string) => void;
  priorInteraction: string; setPriorInteraction: (s: string) => void;
  channel: Channel | null;  setChannel: (c: Channel) => void;
  mode: Mode | null;        setMode: (m: Mode) => void;
  canGenerate: boolean;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
}

function FormView({
  target, setTarget,
  relationship, setRelationship,
  goal, setGoal,
  priorInteraction, setPriorInteraction,
  channel, setChannel,
  mode, setMode,
  canGenerate,
  generating,
  error,
  onGenerate,
}: FormProps) {
  const { colors: c } = useTheme();

  return (
    <>
      <Text variant="title">What are you writing?</Text>
      <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1], marginBottom: spacing[5] }}>
        Tell me who you're reaching, what you're trying to achieve, and which channel — I'll produce messages you can copy and send.
      </Text>

      {/* Mode picker */}
      <Text variant="overline" color={c.mutedForeground}>Mode</Text>
      <View style={styles.modeList}>
        {MODES.map(m => {
          const selected = mode === m.id;
          return (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`Mode: ${m.title}`}
              accessibilityState={{ selected }}
              onPress={() => {
                void Haptics.selectionAsync();
                setMode(m.id);
              }}
            >
              <Card
                variant={selected ? 'primary' : 'default'}
                style={selected ? [styles.modeCard, { borderColor: c.primary, borderWidth: 2 }] : styles.modeCard}
              >
                <Text variant="label">{m.title}</Text>
                <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                  {m.copy}
                </Text>
              </Card>
            </Pressable>
          );
        })}
      </View>

      {/* Channel */}
      <Text variant="overline" color={c.mutedForeground} style={{ marginTop: spacing[5] }}>Channel</Text>
      <View style={styles.channelRow}>
        {CHANNELS.map(ch => {
          const selected = channel === ch.id;
          return (
            <Pressable
              key={ch.id}
              accessibilityRole="button"
              accessibilityLabel={`Channel: ${ch.label}`}
              accessibilityState={{ selected }}
              onPress={() => {
                void Haptics.selectionAsync();
                setChannel(ch.id);
              }}
              style={[
                styles.channelPill,
                {
                  backgroundColor: selected ? c.primaryAlpha10 : c.card,
                  borderColor:     selected ? c.primary        : c.border,
                },
              ]}
            >
              <Text variant="label" color={selected ? c.primary : c.foreground}>
                {ch.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Target description */}
      <TextField
        label={mode === 'batch' ? 'Who are you reaching out to?' : 'Who is the recipient?'}
        hint={mode === 'batch'
          ? '"Restaurant owners in Accra who serve event venues"'
          : '"Mariama, operations manager at Hotel Barmoi"'}
        value={target}
        onChangeText={setTarget}
      />

      {/* Relationship */}
      <TextField
        label="Your relationship to them"
        hint='"We met at the Ecobank event last month" / "Cold — no prior contact"'
        value={relationship}
        onChangeText={setRelationship}
      />

      {/* Goal */}
      <TextField
        label="What's the goal?"
        hint='"Get them to agree to a 15-minute demo" / "Re-engage after 3 weeks silent"'
        value={goal}
        onChangeText={setGoal}
      />

      {/* Optional prior interaction */}
      <TextField
        label="Prior interaction (optional)"
        hint='Leave blank for cold outreach'
        value={priorInteraction}
        onChangeText={setPriorInteraction}
      />

      {error && (
        <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[3] }}>
          {error}
        </Text>
      )}

      <Button
        title={generating
          ? (mode === 'batch' ? 'Writing 5-10 messages…' : 'Writing your messages…')
          : 'Generate'}
        onPress={onGenerate}
        loading={generating}
        disabled={!canGenerate}
        size="lg"
        fullWidth
        icon={<Send size={iconSize.md} color={c.primaryForeground} />}
        style={{ marginTop: spacing[6] }}
      />
    </>
  );
}

function TextField({
  label, hint, value, onChangeText,
}: {
  label: string; hint: string; value: string; onChangeText: (s: string) => void;
}) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: spacing[5] }}>
      <Text variant="overline" color={c.mutedForeground} style={{ marginBottom: spacing[2] }}>
        {label}
      </Text>
      <View style={[styles.textArea, { backgroundColor: c.card, borderColor: c.border }]}>
        <RNTextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={hint}
          placeholderTextColor={c.placeholder}
          multiline
          maxLength={500}
          style={[styles.input, { color: c.foreground }]}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// OutputView — renders per-mode
// ---------------------------------------------------------------------------

interface OutputProps {
  output:          ComposerOutput;
  mode:            Mode;
  sentIds:         Set<string>;
  onMarkSent:      (id: string, sent: boolean) => void;
  onRegenerate:    (id: string, instruction: string) => Promise<void>;
  onCoachHandoff?: (m: ComposerMessage) => void;
  onStartOver:     () => void;
  onBackToRoadmap: () => void;
}

function OutputView({
  output,
  mode,
  sentIds,
  onMarkSent,
  onRegenerate,
  onCoachHandoff,
  onStartOver,
  onBackToRoadmap,
}: OutputProps) {
  const { colors: c } = useTheme();
  const modeHeading = mode === 'batch'
    ? `${output.messages.length} message${output.messages.length === 1 ? '' : 's'}`
    : mode === 'sequence'
      ? '3-step follow-up sequence'
      : 'Your message';

  return (
    <>
      <Text variant="title">{modeHeading}</Text>
      <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1], marginBottom: spacing[4] }}>
        {mode === 'batch' && 'Each message shares the same core pitch but varies the opening and personalisation hook.'}
        {mode === 'sequence' && 'Send in order. Day 5 assumes no response to Day 1. Day 14 either reframes or closes gracefully.'}
        {mode === 'single' && 'Copy, paste, send. Use "Try a different angle" if the tone is not quite right.'}
      </Text>

      <View style={styles.messagesList}>
        {output.messages.map(m => (
          <ComposerMessageCard
            key={m.id}
            message={m}
            isSent={sentIds.has(m.id)}
            onMarkSent={onMarkSent}
            onRegenerate={onRegenerate}
            onCoachHandoff={onCoachHandoff}
          />
        ))}
      </View>

      <Button
        title="Start over with different context"
        onPress={onStartOver}
        variant="ghost"
        size="md"
        fullWidth
        style={{ marginTop: spacing[6] }}
      />
      <Button
        title="Done — back to my roadmap"
        onPress={onBackToRoadmap}
        variant="secondary"
        size="md"
        fullWidth
        style={{ marginTop: spacing[2] }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  modeList: {
    gap: spacing[2],
    marginTop: spacing[2],
  },
  modeCard: {
    padding: spacing[3],
  },
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  channelPill: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2.5],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  textArea: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[3],
  },
  input: {
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.leading.relaxed,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  messagesList: {
    gap: spacing[3],
  },
});

