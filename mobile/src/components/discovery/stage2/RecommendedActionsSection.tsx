// src/components/discovery/stage2/RecommendedActionsSection.tsx
//
// Mobile counterpart to client/src/components/ideation/RecommendedActionsSection.tsx.
// Read-only render of the founder's accumulated recommended-action
// log. Empty list collapses the section entirely so the review surface
// stays tight.

import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card } from '@/components/ui';
import type { RecommendedAction } from '@/lib/ideation-types';
import { spacing } from '@/constants/theme';

interface Props {
  actions: ReadonlyArray<RecommendedAction>;
}

export function RecommendedActionsSection({ actions }: Props) {
  const { colors: c } = useTheme();
  if (actions.length === 0) return null;

  return (
    <View>
      <Text variant="label" color={c.foreground} style={{ marginBottom: spacing[3] }}>
        Recommended actions
      </Text>
      <View style={styles.list}>
        {actions.map((a, i) => (
          <Card key={i}>
            <View style={styles.meta}>
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
            <Text variant="body" color={c.foreground} style={{ marginTop: spacing[1] }}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing[2],
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
});
