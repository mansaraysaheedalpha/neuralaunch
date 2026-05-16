// src/components/discovery/OutcomeDocumentView.tsx
//
// Mobile counterpart to
// client/src/app/(app)/discovery/no-idea/[sessionId]/OutcomeDocumentView.tsx.
// Renders the Stage 1 Outcome Document in pre-commit-review or
// committed mode. Supports:
//
//   - Edit a dimension      → POST /api/ideation/stage-runs/[id]/edit
//                             reverts the run to authoring scoped to
//                             that dimension; parent refetches and the
//                             dispatcher routes back to Stage1Chat.
//   - I'm ready for Stage 2 → POST /api/ideation/stage-runs/[id]/commit
//                             flips output_ready → committed; parent
//                             refetches.
//   - Save and come back    → router.replace('/discovery').
//   - Continue to Stage 2   → committed-mode CTA. Stage 2 itself is a
//                             Phase D deliverable, so for now this
//                             routes back to /discovery; once Stage 2
//                             ships, swap in the actual destination.
//
// The Outcome Document arrives pre-parsed from the hydration endpoint
// (server-side safeParseOutcomeDocument), so no client-side zod is
// needed — the parallel TS type below describes the wire format.

import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Pencil, RotateCcw } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Button, Card } from '@/components/ui';
import type {
  OutcomeDocument,
  FinancialGoalValue,
} from '@/lib/ideation-types';
import {
  DIM_LABELS,
  labelFor,
  type EditableDim,
} from './outcome-labels';
import { useOutcomeDocumentActions } from './useOutcomeDocumentActions';
import { spacing, iconSize, radius } from '@/constants/theme';

// Re-export the canonical OutcomeDocument type for existing consumers
// that import it from this module's path. New code should import
// directly from '@/lib/ideation-types'.
export type { OutcomeDocument };

interface Props {
  stageRunId:    string;
  status:        'output_ready' | 'committed';
  document:      OutcomeDocument;
  /** Called after commit or edit returns OK. Parent refetches the
   *  session hydration so the dispatcher transitions surfaces. */
  onAfterAction: () => Promise<void> | void;
}

export function OutcomeDocumentView({
  stageRunId,
  status,
  document,
  onAfterAction,
}: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();
  // Action handlers live in a dedicated hook so the view stays
  // focused on layout — see useOutcomeDocumentActions for the
  // network shape + busy/error semantics.
  const {
    busy,
    actionError,
    handleCommit,
    handleEdit,
  } = useOutcomeDocumentActions({ stageRunId, onAfterAction });

  function renderDimensionValue(key: EditableDim): string {
    const dim = document.dimensions[key];
    if (dim.value === null) return 'Not captured';
    if (key === 'financialGoal') {
      const v = dim.value as FinancialGoalValue;
      const base = labelFor(v.shape);
      return v.target ? `${base} — ${v.target}` : base;
    }
    return labelFor(String(dim.value));
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text variant="overline" color={c.mutedForeground}>
          {status === 'committed' ? 'Committed' : 'Pre-commit review'}
        </Text>
        <Text variant="heading" style={{ marginTop: spacing[1] }}>
          Your outcome — Stage 1 of 5
        </Text>
      </View>

      <Section title="The four dimensions">
        <View style={styles.dimensionList}>
          {(Object.keys(DIM_LABELS) as EditableDim[]).map(key => (
            <Card key={key}>
              <View style={styles.dimensionHeader}>
                <Text variant="caption" color={c.mutedForeground}>
                  {DIM_LABELS[key]}
                </Text>
                <Button
                  title=""
                  onPress={() => handleEdit(key)}
                  disabled={busy}
                  variant="ghost"
                  size="sm"
                  icon={<Pencil size={iconSize.sm} color={busy ? c.mutedForeground : c.primary} />}
                  accessibilityLabel={`Edit ${DIM_LABELS[key]}`}
                  style={styles.editIconButton}
                />
              </View>
              <Text variant="body" style={{ marginTop: spacing[1] }}>
                {renderDimensionValue(key)}
              </Text>
            </Card>
          ))}
        </View>
      </Section>

      <Section title="The whole picture">
        <Text variant="body" color={document.synthesisParagraph ? c.foreground : c.mutedForeground}>
          {document.synthesisParagraph || 'No synthesis written.'}
        </Text>
      </Section>

      <Section title="What this rules out">
        <Text variant="body" color={document.rulesOut ? c.foreground : c.mutedForeground}>
          {document.rulesOut || 'No exclusions written.'}
        </Text>
      </Section>

      {document.recommendedActions.length > 0 && (
        <Section title="Recommended actions">
          <View style={{ gap: spacing[2] }}>
            {document.recommendedActions.map((a, i) => (
              <Card key={i}>
                <View style={styles.actionMeta}>
                  <Text
                    variant="caption"
                    color={a.severity === 'strongly_advised' ? c.secondary : c.mutedForeground}
                    weight={a.severity === 'strongly_advised' ? 'semibold' : undefined}
                  >
                    {a.severity === 'strongly_advised' ? 'Strongly advised' : 'Suggested'}
                  </Text>
                  <Text variant="caption" color={c.mutedForeground}>·</Text>
                  <Text variant="caption" color={c.mutedForeground}>{a.status}</Text>
                </View>
                <Text variant="body" style={{ marginTop: spacing[1] }}>
                  {a.action}
                </Text>
                {a.founderResponse && (
                  <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[2] }}>
                    You said: {a.founderResponse}
                  </Text>
                )}
              </Card>
            ))}
          </View>
        </Section>
      )}

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
            title="I'm ready for Stage 2"
            onPress={handleCommit}
            disabled={busy}
            loading={busy}
            variant="primary"
            size="md"
            icon={<ArrowRight size={iconSize.sm} color={c.primaryForeground} />}
          />
        ) : (
          <Button
            // Stage 2 itself ships in a later phase — for now we close
            // the loop with a graceful "back to discovery" so the
            // founder can pick up other ventures.
            title="Continue to Stage 2"
            onPress={() => router.replace('/discovery' as any)}
            disabled={busy}
            variant="primary"
            size="md"
            icon={<ArrowRight size={iconSize.sm} color={c.primaryForeground} />}
          />
        )}
      </View>

      <View style={styles.footnote}>
        <RotateCcw size={iconSize.sm} color={c.mutedForeground} />
        <Text variant="caption" color={c.mutedForeground} style={{ flex: 1 }}>
          Editing a dimension reopens the conversation for that field only — you can discard
          and restore.
        </Text>
      </View>
    </ScrollView>
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
  section: {
    marginBottom: spacing[6],
  },
  dimensionList: {
    gap: spacing[2],
  },
  dimensionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editIconButton: {
    minWidth: 28,
    paddingHorizontal: spacing[1],
  },
  actionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  footnote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    marginTop: spacing[6],
  },
});
