// src/components/discovery/useOutcomeDocumentActions.ts
//
// Commit + edit dispatchers for the Stage 1 OutcomeDocumentView
// review surface. Extracted from the view so it stays focused on
// layout and so the action layer is independently testable.
//
// Mirrors the shape of useRequirementsActions for Stage 2 — see that
// hook for the same patterns applied to a larger action surface.

import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { api } from '@/services/api-client';
import type { EditableDim } from './outcome-labels';

interface Args {
  stageRunId:    string;
  onAfterAction: () => Promise<void> | void;
}

interface Result {
  busy:         boolean;
  actionError:  string | null;
  handleCommit: () => void;
  handleEdit:   (dimension: EditableDim) => void;
}

export function useOutcomeDocumentActions({
  stageRunId,
  onAfterAction,
}: Args): Result {
  const [busy,        setBusy]        = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onAfterAction();
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setActionError(err instanceof Error ? err.message : `Could not ${label}`);
    } finally {
      setBusy(false);
    }
  }, [busy, onAfterAction]);

  const handleCommit = useCallback(() => {
    void runAction('commit', async () => {
      await api(`/api/ideation/stage-runs/${stageRunId}/commit`, { method: 'POST' });
    });
  }, [runAction, stageRunId]);

  const handleEdit = useCallback((dimension: EditableDim) => {
    void runAction('start edit', async () => {
      await api(`/api/ideation/stage-runs/${stageRunId}/edit`, {
        method: 'POST',
        body:   { dimension },
      });
    });
  }, [runAction, stageRunId]);

  return { busy, actionError, handleCommit, handleEdit };
}
