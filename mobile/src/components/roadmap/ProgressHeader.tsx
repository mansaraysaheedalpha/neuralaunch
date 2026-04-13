// src/components/roadmap/ProgressHeader.tsx
//
// Compact progress summary at the top of the roadmap view.
// Shows total weeks, hours/week, and task completion progress.

import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import type { RoadmapProgress } from '@/hooks/useRoadmap';
import { Text, Badge } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

interface Props {
  totalWeeks:   number | null;
  weeklyHours:  number | null;
  progress:     RoadmapProgress | null;
}

export function ProgressHeader({ totalWeeks, weeklyHours, progress }: Props) {
  const { colors: c } = useTheme();

  const completedTasks = progress?.completedTasks ?? 0;
  const totalTasks     = progress?.totalTasks ?? 0;
  const blockedTasks   = progress?.blockedTasks ?? 0;
  const percentage     = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <View style={styles.container}>
      {/* Top row: weeks + hours */}
      <View style={styles.metaRow}>
        {totalWeeks != null && (
          <Text variant="label">
            {totalWeeks} week{totalWeeks !== 1 ? 's' : ''}
          </Text>
        )}
        {totalWeeks != null && weeklyHours != null && (
          <Text variant="caption" color={c.mutedForeground}> · </Text>
        )}
        {weeklyHours != null && (
          <Text variant="caption" color={c.mutedForeground}>
            {weeklyHours} hours/week
          </Text>
        )}
      </View>

      {/* Progress bar */}
      {totalTasks > 0 && (
        <View style={styles.progressSection}>
          <View style={[styles.progressTrack, { backgroundColor: c.muted }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: c.primary, width: `${percentage}%` as any },
              ]}
            />
          </View>
          <View style={styles.progressLabels}>
            <Text variant="caption" color={c.mutedForeground}>
              {completedTasks}/{totalTasks} tasks
            </Text>
            {blockedTasks > 0 && (
              <Badge label={`${blockedTasks} blocked`} variant="destructive" />
            )}
            <Text variant="caption" color={c.primary}>
              {percentage}%
            </Text>
          </View>
        </View>
      )}

      {/* Nudge banner */}
      {progress?.nudgePending && (
        <View style={[styles.nudgeBanner, { backgroundColor: c.warningMuted }]}>
          <Text variant="caption" color={c.warning}>
            It's been a while since your last check-in. Ready to pick up where you left off?
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[3],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  progressSection: {
    gap: spacing[1.5],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nudgeBanner: {
    padding: spacing[3],
    borderRadius: radius.lg,
  },
});
