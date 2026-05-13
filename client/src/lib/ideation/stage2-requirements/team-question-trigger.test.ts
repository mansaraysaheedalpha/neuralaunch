// src/lib/ideation/stage2-requirements/team-question-trigger.test.ts
//
// Business rule: when the Stage 1 outcome demands a team
// (lifestylePreference=fundable_startup OR financialGoal.shape=
// venture_scale) AND the inventory has no teammates AND the targeted
// team-question hasn't been asked this attempt, the chat handler
// asks ONE focused question before composing. Subsequent turns must
// NOT re-ask.
//
// This test exercises the pure predicate (outcomeDemandsTeam) +
// the state flag (teamQuestionAsked); the dispatch decision lives
// in stage2-handler.ts and is covered in an integration walk.

import { describe, it, expect } from 'vitest';
import { outcomeDemandsTeam } from './constants';

describe('outcomeDemandsTeam', () => {
  it('returns true when lifestylePreference is fundable_startup', () => {
    expect(outcomeDemandsTeam({
      lifestylePreference: 'fundable_startup',
      financialGoalShape:  null,
    })).toBe(true);
  });

  it('returns true when financialGoal.shape is venture_scale', () => {
    expect(outcomeDemandsTeam({
      lifestylePreference: null,
      financialGoalShape:  'venture_scale',
    })).toBe(true);
  });

  it('returns true when both team-need signals are set', () => {
    expect(outcomeDemandsTeam({
      lifestylePreference: 'fundable_startup',
      financialGoalShape:  'venture_scale',
    })).toBe(true);
  });

  it('returns false for solo-friendly lifestyle preferences', () => {
    const solo = ['side_hustle', 'full_time_founder', 'lifestyle_business', 'contract_freelance'] as const;
    for (const lp of solo) {
      expect(outcomeDemandsTeam({ lifestylePreference: lp, financialGoalShape: 'side_income' })).toBe(false);
    }
  });

  it('returns false for non-venture financial shapes', () => {
    const nonVenture = ['side_income', 'full_replacement', 'modest_growth', 'wealth_creation'] as const;
    for (const fg of nonVenture) {
      expect(outcomeDemandsTeam({ lifestylePreference: 'full_time_founder', financialGoalShape: fg })).toBe(false);
    }
  });

  it('returns false when both signals are null (Stage 1 dimensions not captured)', () => {
    expect(outcomeDemandsTeam({ lifestylePreference: null, financialGoalShape: null })).toBe(false);
  });
});
