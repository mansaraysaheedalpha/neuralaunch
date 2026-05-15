// src/components/discovery/stage2/RequirementsDocumentView.tsx
//
// Mobile counterpart to client/src/components/ideation/RequirementsDocumentView.tsx.
// Review surface for Stage 2 output_ready / committed rows. Composes
// the four document sections:
//
//   - Expected Profile (with per-entry pushback drawer)
//   - Constraints (grouped by severity)
//   - Structural Blocker (only when triggered; choice modal-ish)
//   - Recommended Actions
//
// Founder affordances:
//   - Question this (Expected Profile entries) — pushback drawer
//   - Pick a structural-blocker path (when triggered)
//   - Re-derive (when Stage 1 cascade fired)
//   - I'm ready for Stage 3 (commit + parent refetches)
//
// Edit-the-canvas affordances live on Stage2Chat, not here.

import { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowRight, RotateCcw } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button, ScreenContainer } from '@/components/ui';
import { api } from '@/services/api-client';
import type {
  RequirementsDocument,
  ExpectedProfileEntry,
  ExpectedProfilePushbackAction,
  StructuralBlockerChoice,
} from '@/lib/ideation-types';
import { ExpectedProfileView } from './ExpectedProfileView';
import { ConstraintsList } from './ConstraintsList';
import { StructuralBlockerCard } from './StructuralBlockerCard';
import { RecommendedActionsSection } from './RecommendedActionsSection';
import type { PushbackResponse } from './PushbackDrawer';
import { spacing, iconSize, radius } from '@/constants/theme';

interface Props {
  stageRunId:            string;
  status:                'output_ready' | 'committed';
  document:              RequirementsDocument;
  /** True when an upstream Stage 1 edit invalidated derivation —
   *  show the re-derive CTA at the top of the review surface. */
  requiresRederivation?: boolean;
  /** Parent's session refetch — fires after every server-mutating
   *  action so the document re-renders with the persisted state. */
  onAfterAction:         () => Promise<void> | void;
}

export function RequirementsDocumentView({
  stageRunId,
  status,
  document,
  requiresRederivation = false,
  onAfterAction,
}: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const [busy,        setBusy]        = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const readOnly = status === 'committed';

  async function runAction(label: string, fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onAfterAction();
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setActionError(err instanceof Error ? err.message : `Could not ${label}`);
    } finally {
      setBusy(false);
    }
  }

  function handleCommit() {
    void runAction('commit', async () => {
      await api(`/api/ideation/stage-runs/${stageRunId}/commit`, { method: 'POST' });
    });
  }

  function handleRederive() {
    void runAction('re-derive', async () => {
      await api(`/api/ideation/stage-runs/${stageRunId}/derive-expected-profile`, {
        method: 'POST',
        body:   {},
      });
    });
  }

  async function handleStructuralChoose(
    choice: StructuralBlockerChoice,
    notes:  string | null,
  ) {
    // Errors thrown out of this handler are caught by StructuralBlockerCard
    // and displayed inline — keep it raw rather than wrapping in runAction
    // so the card owns its own busy / error UX.
    await api(`/api/ideation/stage-runs/${stageRunId}/structural-blocker-choice`, {
      method: 'POST',
      body:   { choice, notes },
    });
    await onAfterAction();
  }

  async function handlePushback(args: {
    entryIndex:   number;
    message:      string;
    priorVersion: number;
  }): Promise<PushbackResponse> {
    // PushbackDrawer manages its own busy state and surfaces errors
    // inline, so we throw rather than swallow.
    const data = await api<{
      action:  ExpectedProfilePushbackAction;
      message: string;
      entry:   ExpectedProfileEntry;
      version: number;
      status:  'open' | 'closed';
    }>(`/api/ideation/stage-runs/${stageRunId}/expected-profile-pushback`, {
      method: 'POST',
      body:   args,
    });
    await onAfterAction();
    return data;
  }

  return (
    <ScreenContainer scroll={false}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Stage 2 — Requirements',
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text variant="overline" color={c.mutedForeground}>
            {status === 'committed' ? 'Committed' : 'Pre-commit review'}
          </Text>
          <Text variant="heading" style={{ marginTop: spacing[1] }}>
            Your requirements — Stage 2 of 5
          </Text>
        </View>

        {requiresRederivation && (
          <View style={[styles.rederive, { borderColor: c.secondary, backgroundColor: c.secondaryAlpha10 }]}>
            <View style={{ flex: 1 }}>
              <Text variant="label" color={c.foreground}>
                Stage 1 was updated
              </Text>
              <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
                Your Skill Inventory is preserved, but the Expected Profile and
                Constraints below are derived against the prior Outcome Document.
                Re-derive to align them with what you just committed.
              </Text>
            </View>
            <Button
              title="Re-derive"
              onPress={handleRederive}
              disabled={busy}
              loading={busy}
              variant="primary"
              size="sm"
              icon={<RotateCcw size={iconSize.xs} color={c.primaryForeground} />}
            />
          </View>
        )}

        <Section title="The expected profile">
          <ExpectedProfileView
            entries={document.expectedProfile}
            readOnly={readOnly}
            onPushback={handlePushback}
          />
        </Section>

        <Section title="Constraints">
          <ConstraintsList constraints={document.constraints} />
        </Section>

        <View style={{ marginBottom: spacing[6] }}>
          <StructuralBlockerCard
            blocker={document.structuralBlocker}
            readOnly={readOnly}
            onChoose={handleStructuralChoose}
          />
        </View>

        <View style={{ marginBottom: spacing[6] }}>
          <RecommendedActionsSection actions={document.recommendedActions} />
        </View>

        {actionError && (
          <View style={[styles.errorBanner, { borderColor: c.destructive, backgroundColor: c.destructiveMuted }]}>
            <Text variant="caption" color={c.destructive}>
              {actionError}
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <Button
            title="Save and come back"
            onPress={() => router.replace('/discovery' as any)}
            disabled={busy}
            variant="ghost"
            size="md"
          />
          {status === 'output_ready' ? (
            <Button
              title="I'm ready for Stage 3"
              onPress={handleCommit}
              disabled={busy}
              loading={busy}
              variant="primary"
              size="md"
              icon={<ArrowRight size={iconSize.sm} color={c.primaryForeground} />}
            />
          ) : (
            <Text variant="caption" color={c.mutedForeground}>
              Committed · Stage 3 coming soon
            </Text>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="label" color={c.foreground} style={{ marginBottom: spacing[3] }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing[4],
    paddingBottom: spacing[8],
  },
  header: {
    marginBottom: spacing[6],
  },
  rederive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing[6],
  },
  section: {
    marginBottom: spacing[6],
  },
  errorBanner: {
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing[3],
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[3],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
});
