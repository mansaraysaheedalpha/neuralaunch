// src/components/discovery/stage2/useStage2ChatDispatchers.ts
//
// Wraps the canvas + derive dispatchers from useStage2Session so each
// one fires onSessionRefresh after a successful server write. Extracted
// from Stage2Chat so the parent component stays under CLAUDE.md's
// 200-line cap and so the wrap logic is testable in isolation.
//
// The hook depends on individual dispatcher refs (not the parent
// `stage2` result object, which is a fresh literal every render) so
// each wrapped callback is stable across renders. This lets SkillCanvas
// — and any future React.memo around it — actually benefit from the
// callback identity.

import { useCallback } from 'react';
import type { useStage2Session } from '@/hooks/useStage2Session';

type Stage2 = ReturnType<typeof useStage2Session>;

interface Args {
  updateSkillTier:       Stage2['updateSkillTier'];
  addTeammate:           Stage2['addTeammate'];
  removeTeammate:        Stage2['removeTeammate'];
  renameTeammate:        Stage2['renameTeammate'];
  deriveExpectedProfile: Stage2['deriveExpectedProfile'];
  onSessionRefresh:      () => Promise<void> | void;
}

interface Result {
  updateSkillTier:       Stage2['updateSkillTier'];
  addTeammate:           Stage2['addTeammate'];
  removeTeammate:        Stage2['removeTeammate'];
  renameTeammate:        Stage2['renameTeammate'];
  deriveExpectedProfile: Stage2['deriveExpectedProfile'];
}

export function useStage2ChatDispatchers({
  updateSkillTier,
  addTeammate,
  removeTeammate,
  renameTeammate,
  deriveExpectedProfile,
  onSessionRefresh,
}: Args): Result {
  const wrappedUpdateSkillTier = useCallback<Stage2['updateSkillTier']>(
    async (person, skill, tier) => {
      await updateSkillTier(person, skill, tier);
      await onSessionRefresh();
    },
    [updateSkillTier, onSessionRefresh],
  );
  const wrappedAddTeammate = useCallback<Stage2['addTeammate']>(
    async (name) => {
      await addTeammate(name);
      await onSessionRefresh();
    },
    [addTeammate, onSessionRefresh],
  );
  const wrappedRemoveTeammate = useCallback<Stage2['removeTeammate']>(
    async (idx) => {
      await removeTeammate(idx);
      await onSessionRefresh();
    },
    [removeTeammate, onSessionRefresh],
  );
  const wrappedRenameTeammate = useCallback<Stage2['renameTeammate']>(
    async (idx, name) => {
      await renameTeammate(idx, name);
      await onSessionRefresh();
    },
    [renameTeammate, onSessionRefresh],
  );
  const wrappedDeriveExpectedProfile = useCallback<Stage2['deriveExpectedProfile']>(
    async () => {
      await deriveExpectedProfile();
      await onSessionRefresh();
    },
    [deriveExpectedProfile, onSessionRefresh],
  );

  return {
    updateSkillTier:       wrappedUpdateSkillTier,
    addTeammate:           wrappedAddTeammate,
    removeTeammate:        wrappedRemoveTeammate,
    renameTeammate:        wrappedRenameTeammate,
    deriveExpectedProfile: wrappedDeriveExpectedProfile,
  };
}
