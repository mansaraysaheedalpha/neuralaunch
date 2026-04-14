// src/components/roadmap/PhaseBlock.tsx
//
// Renders one phase of the roadmap: phase number badge, title,
// objective, duration, and its list of TaskCards.

import { View, StyleSheet } from 'react-native';
import { CalendarDays } from 'lucide-react-native';

import { useTheme } from '@/hooks/useTheme';
import type { RoadmapPhase } from '@/hooks/useRoadmap';
import { Text } from '@/components/ui';
import { TaskCard } from './TaskCard';
import { spacing } from '@/constants/theme';

interface Props {
  phase:            RoadmapPhase;
  index:            number;
  roadmapId:        string;
  recommendationId: string;
}

export function PhaseBlock({ phase, index, roadmapId, recommendationId }: Props) {
  const { colors: c } = useTheme();

  return (
    <View style={styles.container}>
      {/* Phase header */}
      <View style={styles.header}>
        <View style={[styles.phaseNumber, { backgroundColor: c.primaryAlpha10 }]}>
          <Text variant="label" color={c.primary} weight="bold">
            {phase.phase}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text variant="title">{phase.title}</Text>
          <Text variant="caption" color={c.mutedForeground} style={{ marginTop: spacing[0.5] }}>
            {phase.objective}
          </Text>
          <View style={styles.durationRow}>
            <CalendarDays size={11} color={c.mutedForeground} style={{ opacity: 0.6 }} />
            <Text variant="caption" color={c.mutedForeground} style={{ opacity: 0.6 }}>
              {phase.durationWeeks} week{phase.durationWeeks !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Tasks */}
      <View style={styles.tasks}>
        {phase.tasks.map((task, i) => (
          <TaskCard
            key={i}
            task={task}
            index={i}
            phaseNumber={phase.phase}
            roadmapId={roadmapId}
            recommendationId={recommendationId}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[4],
  },
  header: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'flex-start',
  },
  phaseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[0.5],
  },
  tasks: {
    paddingLeft: spacing[10],
    gap: spacing[3],
  },
});
