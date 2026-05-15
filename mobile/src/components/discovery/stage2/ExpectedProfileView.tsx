// src/components/discovery/stage2/ExpectedProfileView.tsx
//
// Mobile counterpart to client/src/components/ideation/ExpectedProfileView.tsx.
// Renders the derived Expected Profile entries — one card per (skill,
// requiredTier) pair, with the agent's reasoning + citation chips +
// an optional "Question this" affordance that opens the inline
// PushbackDrawer (capped at EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND
// rounds, locked to read-only when pushback.status === 'closed').

import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import type { ExpectedProfileEntry } from '@/lib/ideation-types';
import { SKILL_LABELS, TIER_LABEL } from './labels';
import { PushbackDrawer, type PushbackResponse } from './PushbackDrawer';
import { spacing, iconSize, radius } from '@/constants/theme';

const HARD_CAP_ROUND = 5;

interface Props {
  entries:    ExpectedProfileEntry[];
  /** True when the document is committed — pushback is read-only. */
  readOnly?:  boolean;
  /** Run a pushback round on a single entry. Returns the agent's
   *  response so the drawer can update its local state. */
  onPushback: (args: {
    entryIndex:   number;
    message:      string;
    priorVersion: number;
  }) => Promise<PushbackResponse>;
}

export function ExpectedProfileView({ entries, readOnly = false, onPushback }: Props) {
  if (entries.length === 0) {
    return (
      <EmptyExpected />
    );
  }

  return (
    <View style={styles.list}>
      {entries.map((entry, i) => (
        <EntryCard
          key={`${entry.skill}-${i}`}
          entryIndex={i}
          entry={entry}
          readOnly={readOnly}
          onPushback={onPushback}
        />
      ))}
    </View>
  );
}

function EmptyExpected() {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.card }]}>
      <Text variant="caption" color={c.mutedForeground}>
        No Expected Profile entries yet. Derive one from the canvas above.
      </Text>
    </View>
  );
}

interface EntryCardProps {
  entryIndex: number;
  entry:      ExpectedProfileEntry;
  readOnly:   boolean;
  onPushback: Props['onPushback'];
}

function EntryCard({ entryIndex, entry, readOnly, onPushback }: EntryCardProps) {
  const { colors: c } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isClosed = entry.pushback?.status === 'closed';
  const rounds   = entry.pushback?.history.length ?? 0;

  return (
    <View style={[styles.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeading}>
          <Text variant="label" color={c.foreground}>
            {SKILL_LABELS[entry.skill] ?? entry.skill}
          </Text>
          <Text variant="caption" color={c.mutedForeground}>
            requires {TIER_LABEL[entry.requiredTier] ?? entry.requiredTier}
          </Text>
          {entry.critical && (
            <Text variant="caption" color={c.secondary} weight="semibold">
              critical
            </Text>
          )}
        </View>

        {!readOnly && !isClosed && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Question this requirement"
            onPress={() => setDrawerOpen(o => !o)}
            style={({ pressed }) => [
              styles.questionBtn,
              { borderColor: c.border },
              pressed && { opacity: 0.7 },
            ]}
          >
            <MessageCircle size={iconSize.xs} color={c.mutedForeground} />
            <Text variant="caption" color={c.foreground}>Question this</Text>
            {rounds > 0 && (
              <Text variant="caption" color={c.mutedForeground}>
                {' '}({rounds}/{HARD_CAP_ROUND})
              </Text>
            )}
          </Pressable>
        )}
        {isClosed && (
          <Text variant="caption" color={c.mutedForeground} style={{ fontStyle: 'italic' }}>
            pushback closed
          </Text>
        )}
      </View>

      <Text variant="body" color={entry.reasoning ? c.foreground : c.mutedForeground} style={{ marginTop: spacing[2] }}>
        {entry.reasoning || '(no reasoning generated)'}
      </Text>

      {entry.sources.length > 0 && (
        <View style={styles.sources}>
          {entry.sources.map((s, j) => (
            <View key={j} style={[styles.sourcePill, { borderColor: c.border }]}>
              <Text variant="caption" color={c.mutedForeground}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {drawerOpen && (
        <PushbackDrawer
          entryIndex={entryIndex}
          entry={entry}
          onPushback={onPushback}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing[3],
  },
  empty: {
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  card: {
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[2],
    flexWrap: 'wrap',
    flex: 1,
  },
  questionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1.5],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  sources: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1.5],
    marginTop: spacing[2],
  },
  sourcePill: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: 999,
    borderWidth: 1,
  },
});
