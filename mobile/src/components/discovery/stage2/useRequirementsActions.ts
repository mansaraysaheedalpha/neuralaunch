// src/components/discovery/stage2/useRequirementsActions.ts
//
// Action handlers for the Stage 2 RequirementsDocumentView review
// surface. Extracted from the composer so the composer stays under
// CLAUDE.md's 200-line cap and so the action layer is independently
// testable (mock the api() helper, drive the hook directly).
//
// Behaviour notes:
//   - commit / re-derive go through `runAction`, which manages a
//     shared busy flag + the inline `actionError` banner. Haptics
//     fire on success / failure.
//   - structural-blocker-choice deliberately bypasses runAction —
//     StructuralBlockerCard owns its own busy + error UX, so the
//     handler just throws on failure and the card catches.
//   - expected-profile-pushback also bypasses runAction —
//     PushbackDrawer manages its own per-round busy state and
//     returns the agent's response back to the drawer for inline
//     rendering, so the handler returns the parsed body.

import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { api } from '@/services/api-client';
import type {
  ExpectedProfileEntry,
  ExpectedProfilePushbackAction,
  StructuralBlockerChoice,
} from '@/lib/ideation-types';
import type { PushbackResponse } from './PushbackDrawer';

interface UseRequirementsActionsArgs {
  stageRunId:     string;
  onAfterAction:  () => Promise<void> | void;
}

interface UseRequirementsActionsResult {
  busy:                     boolean;
  actionError:              string | null;
  handleCommit:             () => void;
  handleRederive:           () => void;
  handleStructuralChoose:   (choice: StructuralBlockerChoice, notes: string | null) => Promise<void>;
  handlePushback:           (args: {
    entryIndex:   number;
    message:      string;
    priorVersion: number;
  }) => Promise<PushbackResponse>;
}

export function useRequirementsActions({
  stageRunId,
  onAfterAction,
}: UseRequirementsActionsArgs): UseRequirementsActionsResult {
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

  const handleRederive = useCallback(() => {
    void runAction('re-derive', async () => {
      await api(`/api/ideation/stage-runs/${stageRunId}/derive-expected-profile`, {
        method: 'POST',
        body:   {},
      });
    });
  }, [runAction, stageRunId]);

  const handleStructuralChoose = useCallback(
    async (choice: StructuralBlockerChoice, notes: string | null) => {
      // Errors thrown out of this handler are caught by
      // StructuralBlockerCard and displayed inline — keep it raw rather
      // than wrapping in runAction so the card owns its own UX.
      await api(`/api/ideation/stage-runs/${stageRunId}/structural-blocker-choice`, {
        method: 'POST',
        body:   { choice, notes },
      });
      await onAfterAction();
    },
    [stageRunId, onAfterAction],
  );

  const handlePushback = useCallback(
    async (args: {
      entryIndex:   number;
      message:      string;
      priorVersion: number;
    }): Promise<PushbackResponse> => {
      const data = await api<{
        action:  ExpectedProfilePushbackAction;
        message: string;
        entry:   ExpectedProfileEntry;
        version: number;
        status:  'open' | 'closed';
      }>(`/api/ideation/stage-runs/${stageRunId}/expected-profile-pushback`, {
        method: 'POST',
        body:   args,
      });
      await onAfterAction();
      return data;
    },
    [stageRunId, onAfterAction],
  );

  return {
    busy,
    actionError,
    handleCommit,
    handleRederive,
    handleStructuralChoose,
    handlePushback,
  };
}
