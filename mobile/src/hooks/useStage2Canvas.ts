// src/hooks/useStage2Canvas.ts
//
// Canvas action dispatchers for the Stage 2 chat hook. Extracted from
// useStage2Session so that hook stays under CLAUDE.md's 300-line cap
// and so the canvas-write path can be tested without the streaming
// machinery alongside.
//
// All five actions (updateSkillTier / addTeammate / removeTeammate /
// renameTeammate / deriveExpectedProfile) hit narrow ideation routes
// that the server dual-writes into FounderProfile inside a Prisma
// transaction. Errors land in turnError so the UI banner picks them
// up; the dispatchers also re-throw so callers that care can branch.
//
// The derive call is the odd-one-out: it flips status='composing'
// for the ~15s server roundtrip and back to 'idle'/'error' after, so
// the parent Stage2Chat can show a spinner.

import { useCallback } from 'react';
import { api } from '@/services/api-client';
import type { SkillKey, SkillTier } from '@/lib/ideation-types';
import type { Stage2Status, Stage2TurnError } from './useStage2Session';

interface Args {
  stageRunId:        string;
  setStatus:         (status: Stage2Status) => void;
  setTurnError:      (err: Stage2TurnError | null) => void;
  beginCanvasWrite:  () => void;
  endCanvasWrite:    () => void;
}

export interface UseStage2CanvasResult {
  updateSkillTier:       (person: 'founder' | number, skill: SkillKey, tier: SkillTier) => Promise<void>;
  addTeammate:           (name: string) => Promise<void>;
  removeTeammate:        (index: number) => Promise<void>;
  renameTeammate:        (index: number, name: string) => Promise<void>;
  deriveExpectedProfile: () => Promise<void>;
}

export function useStage2Canvas({
  stageRunId,
  setStatus,
  setTurnError,
  beginCanvasWrite,
  endCanvasWrite,
}: Args): UseStage2CanvasResult {
  const runAction = useCallback(async (
    label:  string,
    invoke: () => Promise<unknown>,
  ): Promise<void> => {
    setTurnError(null);
    beginCanvasWrite();
    try {
      await invoke();
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not ${label}`;
      setTurnError({ kind: 'action', message });
      throw err instanceof Error ? err : new Error(message);
    } finally {
      endCanvasWrite();
    }
  }, [setTurnError, beginCanvasWrite, endCanvasWrite]);

  const updateSkillTier = useCallback(
    (person: 'founder' | number, skill: SkillKey, tier: SkillTier) =>
      runAction('update skill tier', () =>
        api(`/api/ideation/stage-runs/${stageRunId}/skill-tier`, {
          method: 'POST',
          body:   { person, skill, tier },
        }),
      ),
    [runAction, stageRunId],
  );

  const addTeammate = useCallback(
    (name: string) =>
      runAction('add teammate', () =>
        api(`/api/ideation/stage-runs/${stageRunId}/teammate`, {
          method: 'POST',
          body:   { op: 'add', name },
        }),
      ),
    [runAction, stageRunId],
  );

  const removeTeammate = useCallback(
    (index: number) =>
      runAction('remove teammate', () =>
        api(`/api/ideation/stage-runs/${stageRunId}/teammate`, {
          method: 'POST',
          body:   { op: 'remove', index },
        }),
      ),
    [runAction, stageRunId],
  );

  const renameTeammate = useCallback(
    (index: number, name: string) =>
      runAction('rename teammate', () =>
        api(`/api/ideation/stage-runs/${stageRunId}/teammate`, {
          method: 'POST',
          body:   { op: 'rename', index, name },
        }),
      ),
    [runAction, stageRunId],
  );

  const deriveExpectedProfile = useCallback(async () => {
    // Derive is synchronous on the server (~15s p99 — Expected Profile
    // agent + research). Flip status to 'composing' for the duration
    // so the UI can render its loader / disable derive while in flight.
    setStatus('composing');
    setTurnError(null);
    try {
      await api(`/api/ideation/stage-runs/${stageRunId}/derive-expected-profile`, {
        method: 'POST',
        body:   {},
      });
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setTurnError({
        kind:    'action',
        message: err instanceof Error ? err.message : 'Derivation failed',
      });
    }
  }, [stageRunId, setStatus, setTurnError]);

  return {
    updateSkillTier,
    addTeammate,
    removeTeammate,
    renameTeammate,
    deriveExpectedProfile,
  };
}
