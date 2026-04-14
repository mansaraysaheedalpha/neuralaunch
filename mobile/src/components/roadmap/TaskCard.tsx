// src/components/roadmap/TaskCard.tsx
//
// Interactive roadmap task card — inline status control, check-in
// button, check-in history transcript, coach button, and completion
// moment. Mirrors the web app's InteractiveTaskCard.

import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  Clock,
  Target,
  MessageSquare,
  Send,
  CheckSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/services/api-client';
import type { RoadmapTask, TaskStatus, CheckInEntry } from '@/hooks/useRoadmap';
import { Text, Card, Badge, Button, Separator } from '@/components/ui';
import { spacing, radius } from '@/constants/theme';

interface Props {
  task:             RoadmapTask;
  index:            number;
  phaseNumber:      number;
  roadmapId:        string;
  recommendationId: string;
  onStatusChange?:  () => void;
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'blocked',     label: 'Blocked' },
];

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
  onStatusChange,
}: Props) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const taskId = buildTaskId(phaseNumber, index);

  const [status, setStatus]             = useState<TaskStatus>(task.status ?? 'not_started');
  const [showStatusPicker, setShowPicker] = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  const [pendingStatus, setPendingStatus] = useState(false);

  const checkInCount = task.checkInHistory?.length ?? 0;
  const hasCoach = task.suggestedTools?.includes('conversation_coach');
  const hasComposer = task.suggestedTools?.includes('outreach_composer');

  async function handleStatusChange(newStatus: TaskStatus) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(false);
    const prevStatus = status;
    setStatus(newStatus);
    setPendingStatus(true);

    try {
      await api(`/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/status`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
      onStatusChange?.();
    } catch {
      setStatus(prevStatus); // rollback
    } finally {
      setPendingStatus(false);
    }
  }

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
      {/* Header: title + status picker */}
      <View style={styles.header}>
        <Text variant="label" style={{ flex: 1 }}>{task.title}</Text>
        <Pressable onPress={() => { void Haptics.selectionAsync(); setShowPicker(!showStatusPicker); }}>
          <Badge label={STATUS_OPTIONS.find(s => s.value === status)?.label ?? status} variant={STATUS_VARIANTS[status]} />
        </Pressable>
      </View>

      {/* Status picker dropdown */}
      {showStatusPicker && (
        <View style={[styles.statusPicker, { backgroundColor: c.card, borderColor: c.border }]}>
          {STATUS_OPTIONS.map(opt => (
            <Pressable
              key={opt.value}
              onPress={() => { void handleStatusChange(opt.value); }}
              style={[
                styles.statusOption,
                opt.value === status && { backgroundColor: c.primaryAlpha5 },
              ]}
            >
              <Badge label={opt.label} variant={STATUS_VARIANTS[opt.value]} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Description */}
      <Text variant="caption" color={c.mutedForeground}>{task.description}</Text>

      {/* Meta row */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <View style={styles.metaLabel}>
            <Clock size={11} color={c.mutedForeground} />
            <Text variant="overline" color={c.mutedForeground}>Time</Text>
          </View>
          <Text variant="caption">{task.timeEstimate}</Text>
        </View>
        <View style={[styles.metaItem, { flex: 2 }]}>
          <View style={styles.metaLabel}>
            <Target size={11} color={c.mutedForeground} />
            <Text variant="overline" color={c.mutedForeground}>Done when</Text>
          </View>
          <Text variant="caption">{task.successCriteria}</Text>
        </View>
      </View>

      {/* Rationale */}
      {task.rationale && (
        <Text variant="caption" color={c.primary} style={{ fontStyle: 'italic' }}>
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
      {checkInCount > 0 && (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showHistory ? 'Hide check-in history' : 'Show check-in history'}
            onPress={() => { void Haptics.selectionAsync(); setShowHistory(!showHistory); }}
            style={styles.historyToggle}
          >
            {showHistory
              ? <ChevronUp   size={14} color={c.primary} />
              : <ChevronDown size={14} color={c.primary} />}
            <Text variant="caption" color={c.primary}>
              {showHistory ? 'Hide' : 'Show'} check-in history ({checkInCount})
            </Text>
          </Pressable>

          {showHistory && (
            <View style={styles.historyList}>
              {(task.checkInHistory ?? []).map((entry, i) => (
                <View key={entry.id ?? i} style={[styles.historyEntry, { borderLeftColor: c.primaryAlpha20 }]}>
                  <View style={styles.historyHeader}>
                    <Badge label={entry.category} variant="muted" />
                    <Text variant="caption" color={c.mutedForeground}>
                      Round {entry.round}
                    </Text>
                  </View>
                  <Text variant="caption" style={{ marginTop: spacing[1] }}>
                    {entry.freeText}
                  </Text>
                  <View style={[styles.agentResponse, { backgroundColor: c.muted }]}>
                    <Text variant="caption" color={c.foreground}>
                      {entry.agentResponse}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title={checkInCount > 0 ? `Check in (${checkInCount})` : 'Check in'}
          onPress={handleCheckIn}
          variant="secondary"
          size="sm"
          icon={<CheckSquare size={14} color={c.foreground} />}
        />
        {hasCoach && (
          <Button
            title="Coach"
            onPress={handleCoach}
            variant="ghost"
            size="sm"
            icon={<MessageSquare size={14} color={c.primary} />}
          />
        )}
        {hasComposer && (
          <Button
            title="Outreach"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/roadmap/${roadmapId}/outreach?taskId=${taskId}`);
            }}
            variant="ghost"
            size="sm"
            icon={<Send size={14} color={c.primary} />}
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
  statusPicker: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  statusOption: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  metaItem: {
    flex: 1,
    gap: spacing[0.5],
  },
  metaLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
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
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[1],
  },
  historyList: {
    gap: spacing[3],
    marginTop: spacing[2],
  },
  historyEntry: {
    borderLeftWidth: 2,
    paddingLeft: spacing[3],
  },
  historyHeader: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
  },
  agentResponse: {
    marginTop: spacing[2],
    padding: spacing[3],
    borderRadius: radius.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[1],
  },
});
