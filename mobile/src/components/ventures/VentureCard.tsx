// src/components/ventures/VentureCard.tsx
//
// Single venture tile — renders the name, status badge, cycle list,
// and (for active ventures) a progress bar. Tapping a cycle with a
// roadmapId navigates into that roadmap.

import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Text, Card, Badge } from '@/components/ui';
import { spacing, radius, iconSize } from '@/constants/theme';
import type { Venture } from '@/hooks/useVentures';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted'> = {
  active:    'success',
  paused:    'warning',
  completed: 'muted',
};

const STATUS_LABEL: Record<string, string> = {
  active:    'Active',
  paused:    'Paused',
  completed: 'Completed',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface Props {
  venture: Venture;
}

export function VentureCard({ venture }: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();

  const statusVariant = STATUS_VARIANT[venture.status] ?? 'muted';
  const statusLabel   = STATUS_LABEL[venture.status] ?? venture.status;

  const progressPct = venture.progress && venture.progress.totalTasks > 0
    ? Math.round((venture.progress.completedTasks / venture.progress.totalTasks) * 100)
    : null;

  return (
    <Card>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="label">{venture.name}</Text>
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
            {venture.cycles.length} cycle{venture.cycles.length === 1 ? '' : 's'}
            {' · '}Updated {formatDate(venture.updatedAt)}
          </Text>
        </View>
        <Badge label={statusLabel} variant={statusVariant} />
      </View>

      {/* Progress bar — only for active ventures with a roadmap */}
      {venture.status === 'active' && progressPct !== null && (
        <View style={styles.progressWrapper}>
          <View style={[styles.progressTrack, { backgroundColor: c.muted }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: c.primary,
                  width: `${progressPct}%`,
                },
              ]}
            />
          </View>
          <Text variant="caption" color={c.mutedForeground} style={styles.progressLabel}>
            {venture.progress?.completedTasks ?? 0} / {venture.progress?.totalTasks ?? 0} tasks ({progressPct}%)
          </Text>
        </View>
      )}

      {/* Cycle list */}
      {venture.cycles.length > 0 && (
        <View style={styles.cycles}>
          {venture.cycles.map(cy => {
            const isCurrent = cy.id === venture.currentCycleId;
            const isTappable = !!cy.roadmapId;
            return (
              <Pressable
                key={cy.id}
                disabled={!isTappable}
                onPress={() => {
                  if (!cy.roadmapId) return;
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/roadmap/${cy.roadmapId}`);
                }}
                style={({ pressed }) => [
                  styles.cycle,
                  { borderColor: c.border },
                  isCurrent && { backgroundColor: c.primaryAlpha5, borderColor: c.primaryAlpha20 },
                  pressed && isTappable && { opacity: 0.85 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.cycleHeader}>
                    <Text variant="caption" color={c.mutedForeground}>
                      Cycle {cy.cycleNumber}
                    </Text>
                    {isCurrent && (
                      <View style={[styles.currentChip, { backgroundColor: c.secondaryAlpha10 }]}>
                        <Sparkles size={iconSize.xs} color={c.secondary} />
                        <Text variant="caption" color={c.secondary} style={{ fontWeight: '600' }}>
                          Current
                        </Text>
                      </View>
                    )}
                    <Text variant="caption" color={c.mutedForeground}>
                      {cy.completedAt ? formatDate(cy.completedAt) : 'In progress'}
                    </Text>
                  </View>
                  {cy.selectedForkSummary && (
                    <Text variant="caption" color={c.foreground} style={{ marginTop: spacing[1] }}>
                      {cy.selectedForkSummary}
                    </Text>
                  )}
                </View>
                {isTappable && <ChevronRight size={iconSize.sm} color={c.mutedForeground} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  progressWrapper: {
    marginTop: spacing[3],
    gap: spacing[1],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  progressLabel: {
    marginTop: spacing[0.5],
  },
  cycles: {
    marginTop: spacing[3],
    gap: spacing[2],
  },
  cycle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2.5],
  },
  cycleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  currentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[1.5],
    paddingVertical: spacing[0.5],
    borderRadius: radius.sm,
  },
});
