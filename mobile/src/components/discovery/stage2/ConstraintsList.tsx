// src/components/discovery/stage2/ConstraintsList.tsx
//
// Mobile counterpart to client/src/components/ideation/ConstraintsList.tsx.
// Read-only renderer of computed constraints grouped by severity:
//   - Blind spots   — required skill with no self-assessed level yet
//   - Structural    — gap wide enough to rule out paths that depend
//                     on the skill (≥2 tiers below expected)
//   - Mild          — 1 tier below expected; workable but factor in
//
// Empty constraints list means the founder's inventory meets every
// requirement in the Expected Profile — surfaced as a success card.

import { View, StyleSheet } from 'react-native';
import { AlertCircle, AlertTriangle, HelpCircle } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text } from '@/components/ui';
import type { Constraint } from '@/lib/ideation-types';
import { SKILL_LABELS, TIER_LABEL } from './labels';
import { spacing, iconSize, radius } from '@/constants/theme';

interface Props {
  constraints: Constraint[];
}

export function ConstraintsList({ constraints }: Props) {
  const { colors: c } = useTheme();

  if (constraints.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: c.success, backgroundColor: c.successMuted }]}>
        <Text variant="body" color={c.success}>
          No skill constraints surfaced — your inventory meets every requirement in the
          Expected Profile.
        </Text>
      </View>
    );
  }

  const blind      = constraints.filter(c => c.gap === 'blind_spot');
  const structural = constraints.filter(c => c.gap === 'structural');
  const mild       = constraints.filter(c => c.gap === 'mild');

  return (
    <View style={styles.groups}>
      {blind.length > 0 && (
        <ConstraintGroup
          icon={<HelpCircle size={iconSize.sm} color={c.secondary} />}
          label="Blind spots"
          subtitle="Required skills where neither you nor your team have a self-assessed level yet."
          items={blind}
          accentBorder={c.secondary}
          accentBg={c.secondaryAlpha10}
        />
      )}
      {structural.length > 0 && (
        <ConstraintGroup
          icon={<AlertCircle size={iconSize.sm} color={c.destructive} />}
          label="Structural constraints"
          subtitle="Gaps wide enough to rule out paths that depend on these skills."
          items={structural}
          accentBorder={c.destructive}
          accentBg={c.destructiveMuted}
        />
      )}
      {mild.length > 0 && (
        <ConstraintGroup
          icon={<AlertTriangle size={iconSize.sm} color={c.mutedForeground} />}
          label="Mild constraints"
          subtitle="One tier below — workable, but factor in for opportunity selection."
          items={mild}
          accentBorder={c.border}
          accentBg={c.card}
        />
      )}
    </View>
  );
}

interface GroupProps {
  icon:         React.ReactNode;
  label:        string;
  subtitle:     string;
  items:        Constraint[];
  accentBorder: string;
  accentBg:     string;
}

function ConstraintGroup({ icon, label, subtitle, items, accentBorder, accentBg }: GroupProps) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.group, { borderColor: accentBorder, backgroundColor: accentBg }]}>
      <View style={styles.groupHeader}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text variant="label" color={c.foreground}>{label}</Text>
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[1] }}>
            {subtitle}
          </Text>
        </View>
      </View>
      <View style={styles.items}>
        {items.map((item, i) => (
          <View key={`${item.skill}-${i}`} style={[styles.item, { borderColor: c.border, backgroundColor: c.background }]}>
            <View style={styles.itemHeader}>
              <Text variant="body" color={c.foreground} weight="semibold">
                {SKILL_LABELS[item.skill] ?? item.skill}
              </Text>
              <View style={styles.itemMeta}>
                <Text variant="caption" color={c.mutedForeground}>
                  {TIER_LABEL[item.actualTier] ?? item.actualTier} → needs {TIER_LABEL[item.requiredTier] ?? item.requiredTier}
                </Text>
                {item.critical && (
                  <Text variant="caption" color={c.secondary} weight="semibold">
                    {'  '}critical
                  </Text>
                )}
              </View>
            </View>
            <Text
              variant="caption"
              color={item.implication ? c.foreground : c.mutedForeground}
              style={{ marginTop: spacing[2], fontStyle: item.implication ? 'normal' : 'italic' }}
            >
              {item.implication || '(no implication generated)'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  groups: {
    gap: spacing[4],
  },
  group: {
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  items: {
    gap: spacing[2],
  },
  item: {
    padding: spacing[3],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  itemHeader: {
    gap: spacing[1],
  },
  itemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
