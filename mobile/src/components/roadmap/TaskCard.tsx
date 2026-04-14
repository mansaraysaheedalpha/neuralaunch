// src/components/roadmap/TaskCard.tsx
//
// Interactive roadmap task card — inline status control, check-in
// button, check-in history transcript, coach button, and composer
// button. Mirrors the web app's InteractiveTaskCard.
//
// This file orchestrates. Specialised sub-views (status picker,
// check-in history) live alongside in their own files.

import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { MessageSquare, Send, CheckSquare } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import type { RoadmapTask, TaskStatus } from '@/hooks/useRoadmap';
import { Text, Card, Badge, Button } from '@/components/ui';
import { radius, spacing, iconSize } from '@/constants/theme';
import { STATUS_OPTIONS, STATUS_VARIANTS, buildTaskId } from './task-constants';
import { TaskStatusPicker } from './TaskStatusPicker';
import { TaskCheckInHistory } from './TaskCheckInHistory';
import { TaskMeta } from './TaskMeta';

interface Props {
  task:             RoadmapTask;
  index:            number;
  phaseNumber:      number;
  roadmapId:        string;
  recommendationId: string;
  onStatusChange?:  () => void;
}

export function TaskCard({
  task,
  index,
  phaseNumber,
  roadmapId,
  recommendationId,
  onStatusChange,
}: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const taskId = buildTaskId(phaseNumber, index);

  const [status, setStatus]       = useState<TaskStatus>(task.status ?? 'not_started');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const checkInCount = task.checkInHistory?.length ?? 0;
  const hasCoach    = task.suggestedTools?.includes('conversation_coach');
  const hasComposer = task.suggestedTools?.includes('outreach_composer');

  async function handleStatusChange(next: TaskStatus) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerOpen(false);
    const prev = status;
    setStatus(next);
    try {
      await api(`/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      onStatusChange?.();
    } catch {
      setStatus(prev); // rollback
    }
  }

  function navigate(path: string) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path);
  }

  const statusLabel = STATUS_OPTIONS.find(s => s.value === status)?.label ?? status;

  return (
    <Card style={styles.card}>
      {/* Header: title + status picker trigger */}
      <View style={styles.header}>
        <Text variant="label" style={{ flex: 1 }}>{task.title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Task status: ${statusLabel}. Tap to change.`}
          accessibilityState={{ expanded: pickerOpen }}
          onPress={() => {
            void Haptics.selectionAsync();
            setPickerOpen(v => !v);
          }}
        >
          <Badge label={statusLabel} variant={STATUS_VARIANTS[status]} />
        </Pressable>
      </View>

      {pickerOpen && <TaskStatusPicker value={status} onChange={handleStatusChange} />}

      {/* Description */}
      <Text variant="caption" color={c.mutedForeground}>{task.description}</Text>

      {/* Meta row */}
      <TaskMeta
        timeEstimate={task.timeEstimate}
        successCriteria={task.successCriteria}
      />

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

      {/* Check-in history (collapsible) */}
      <TaskCheckInHistory
        entries={task.checkInHistory ?? []}
        open={historyOpen}
        onToggle={() => setHistoryOpen(v => !v)}
      />

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title={checkInCount > 0 ? `Check in (${checkInCount})` : 'Check in'}
          onPress={() =>
            navigate(`/roadmap/${roadmapId}/checkin?taskId=${taskId}&recommendationId=${recommendationId}`)
          }
          variant="secondary"
          size="sm"
          icon={<CheckSquare size={iconSize.sm} color={c.foreground} />}
        />
        {hasCoach && (
          <Button
            title="Coach"
            onPress={() => navigate(`/roadmap/${roadmapId}/coach?taskId=${taskId}`)}
            variant="ghost"
            size="sm"
            icon={<MessageSquare size={iconSize.sm} color={c.primary} />}
          />
        )}
        {hasComposer && (
          <Button
            title="Outreach"
            onPress={() => navigate(`/roadmap/${roadmapId}/outreach?taskId=${taskId}`)}
            variant="ghost"
            size="sm"
            icon={<Send size={iconSize.sm} color={c.primary} />}
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
  rationale: {
    fontStyle: 'italic',
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
