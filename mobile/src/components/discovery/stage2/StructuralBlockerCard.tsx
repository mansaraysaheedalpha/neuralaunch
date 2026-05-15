// src/components/discovery/stage2/StructuralBlockerCard.tsx
//
// Mobile counterpart to client/src/components/ideation/StructuralBlockerCard.tsx.
// Soft-warning card surfaced only when blocker.triggered === true.
// Founder picks one of three paths plus optional notes:
//
//   - revisit_outcome              go back to Stage 1
//   - plan_team_recruit            keep outcome, plan to recruit
//   - pushed_back_and_committed    disagree, commit anyway
//
// The choice itself doesn't change the constraint computation — adding
// a teammate that fills the gap is what flips `triggered` back to
// false on the next composer pass. Committed documents lock the
// choice (readOnly).

import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { AlertOctagon } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, TextInput } from '@/components/ui';
import type {
  StructuralBlocker,
  StructuralBlockerChoice,
} from '@/lib/ideation-types';
import {
  StructuralBlockerChoiceRow,
  type StructuralBlockerChoiceOption,
} from './StructuralBlockerChoiceRow';
import { spacing, iconSize, radius } from '@/constants/theme';

interface Props {
  blocker:   StructuralBlocker;
  /** True when the document is committed — choice is frozen. */
  readOnly?: boolean;
  onChoose:  (choice: StructuralBlockerChoice, notes: string | null) => Promise<void>;
}

const CHOICES: StructuralBlockerChoiceOption[] = [
  {
    choice:      'revisit_outcome',
    label:       'Revisit the outcome',
    description:
      "Go back to Stage 1 and tighten what you're aiming for. Sometimes the right move " +
      'is a less ambitious shape that fits what you actually have.',
  },
  {
    choice:      'plan_team_recruit',
    label:       'Plan to recruit',
    description:
      'Keep the outcome, plan to fill the gap with a co-founder or hire. The next ' +
      "stages will know your skill profile assumes a team you don't have yet.",
  },
  {
    choice:      'pushed_back_and_committed',
    label:       'I disagree — commit anyway',
    description:
      "You think the Expected Profile got this wrong, or you'll grow into the gap " +
      'mid-build. Logged on the record.',
  },
];

export function StructuralBlockerCard({
  blocker,
  readOnly = false,
  onChoose,
}: Props) {
  const { colors: c } = useTheme();
  const [notes, setNotes] = useState<string>(blocker.notes ?? '');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!blocker.triggered) return null;

  async function handleChoose(choice: StructuralBlockerChoice) {
    if (busy || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      await onChoose(choice, notes.trim() || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your choice');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { borderColor: c.secondary, backgroundColor: c.secondaryAlpha10 }]}>
      <View style={styles.header}>
        <AlertOctagon size={iconSize.lg} color={c.secondary} />
        <View style={{ flex: 1 }}>
          <Text variant="label" color={c.foreground}>
            This outcome looks structurally hard to reach with the current inventory
          </Text>
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
            Two or more critical skills in the Expected Profile sit below the tier the
            outcome demands. That doesn't mean stop — but it does mean the next stage will
            be working with a real constraint. Pick the path that fits.
          </Text>
        </View>
      </View>

      <View style={styles.choices}>
        {CHOICES.map(opt => (
          <StructuralBlockerChoiceRow
            key={opt.choice}
            option={opt}
            selected={blocker.founderChoice === opt.choice}
            disabled={readOnly || busy}
            onPick={() => { void handleChoose(opt.choice); }}
          />
        ))}
      </View>

      <View style={styles.notesWrap}>
        <Text variant="caption" color={c.mutedForeground}>
          Notes (optional) — what your choice actually means for how you'll proceed.
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          editable={!readOnly && !busy}
          multiline
          numberOfLines={3}
          maxLength={800}
          placeholder="Optional context the next stage should know about your choice."
          style={styles.notesInput}
        />
      </View>

      {error && (
        <Text variant="caption" color={c.destructive} style={{ marginTop: spacing[2] }}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  choices: {
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  notesWrap: {
    gap: spacing[2],
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
});
