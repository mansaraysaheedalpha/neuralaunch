// src/components/roadmap/TaskCard.tsx
//
// Interactive roadmap task card — status badge, description, time
// estimate, success criteria, check-in button. The card is the
// primary interaction surface for founders executing their roadmap.

import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import type { RoadmapTask, TaskStatus } from '@/hooks/useRoadmap';
import { Text, Card, Badge, Button } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

interface Props {
  task:             RoadmapTask;
  index:            number;
  phaseNumber:      number;
  roadmapId:        string;
  recommendationId: string;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed:   'Completed',
  blocked:     'Blocked',
};

const STATUS_VARIANTS: Record<TaskStatus, 'muted' | 'primary' | 'success' | 'destructive'> = {
  not_started: 'muted',
  in_progress: 'primary',
  completed:   'success',
  blocked:     'destructive',
};

function buildTaskId(phaseNumber: number, taskIndex: number): string {
  return `p${phaseNumber}t${taskIndex}`;
}

export function TaskCard({
  task,
  index,
  phaseNumber,
  roadmapId,
  recommendationId,
}: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const status: TaskStatus = task.status ?? 'not_started';
  const taskId = buildTaskId(phaseNumber, index);
  const checkInCount = task.checkInHistory?.length ?? 0;
  const hasCoach = task.suggestedTools?.includes('conversation_coach');

  function handleCheckIn() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/roadmap/${roadmapId}/checkin?taskId=${taskId}&recommendationId=${recommendationId}`);
  }

  function handleCoach() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/roadmap/${roadmapId}/coach?taskId=${taskId}`);
  }

  return (
    <Card style={styles.card}>
      {/* Header: title + status */}
      <View style={styles.header}>
        <Text variant="label" style={styles.title}>{task.title}</Text>
        <Badge label={STATUS_LABELS[status]} variant={STATUS_VARIANTS[status]} />
      </View>

      {/* Description */}
      <Text variant="caption" color={c.mutedForeground} style={styles.description}>
        {task.description}
      </Text>

      {/* Meta row: time + success criteria */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text variant="overline" color={c.mutedForeground}>Time</Text>
          <Text variant="caption" color={c.foreground}>{task.timeEstimate}</Text>
        </View>
        <View style={[styles.metaItem, { flex: 2 }]}>
          <Text variant="overline" color={c.mutedForeground}>Done when</Text>
          <Text variant="caption" color={c.foreground}>{task.successCriteria}</Text>
        </View>
      </View>

      {/* Rationale */}
      {task.rationale && (
        <Text variant="caption" color={c.primary} style={styles.rationale}>
          {task.rationale}
        </Text>
      )}

      {/* Resources */}
      {task.resources && task.resources.length > 0 && (
        <View style={styles.resourceRow}>
          {task.resources.map((r, i) => (
            <View key={i} style={[styles.resourceTag, { backgroundColor: c.muted }]}>
              <Text variant="caption" color={c.mutedForeground}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title={checkInCount > 0 ? `Check in (${checkInCount})` : 'Check in'}
          onPress={handleCheckIn}
          variant="secondary"
          size="sm"
        />
        {hasCoach && (
          <Button
            title="Conversation Coach"
            onPress={handleCoach}
            variant="ghost"
            size="sm"
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[2.5],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  title: {
    flex: 1,
  },
  description: {
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  metaItem: {
    flex: 1,
    gap: spacing[0.5],
  },
  rationale: {
    fontStyle: 'italic',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingTop: spacing[2],
  },
  resourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  resourceTag: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: radius.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[1],
  },
});
