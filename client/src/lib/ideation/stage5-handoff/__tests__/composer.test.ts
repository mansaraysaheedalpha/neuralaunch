// src/lib/ideation/stage5-handoff/__tests__/composer.test.ts
//
// Pure composer invariants. The composer has NO LLM call (synthesis
// bridge already populated the Recommendation row); this is just
// the handoff-document assembler. Pins the brief's contract:
// "handoff document schema parses; chosen-opportunity ref +
// recommendation ref consistency."

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { composeStage5HandoffDocument } from '../composer';
import {
  createEmptyStage5AuthoringState,
  seedStage5Authoring,
  applySynthesisResult,
  applySynthesisFailure,
} from '../state';
import type { ChosenOpportunitySnapshot } from '../schema';

function fakeChosen(): ChosenOpportunitySnapshot {
  return {
    id:               'opp_chosen',
    painPointSummary: 'pain',
    agentVerdict:     'pursue',
    founderVerdict:   'pursue',
    agentReasoning:   'because',
    layerASummary:    null,
    layerBSummary:    null,
  };
}

describe('composeStage5HandoffDocument', () => {
  it('throws when synthesis is still pending (awaiting_synthesis)', () => {
    const s = seedStage5Authoring(createEmptyStage5AuthoringState(), fakeChosen(), []);
    expect(() => composeStage5HandoffDocument({ state: s })).toThrow(/synthesis not complete/);
  });

  it('throws when synthesis failed', () => {
    let s = seedStage5Authoring(createEmptyStage5AuthoringState(), fakeChosen(), []);
    s = applySynthesisFailure(s, 'boom');
    expect(() => composeStage5HandoffDocument({ state: s })).toThrow(/synthesis not complete/);
  });

  it('throws when no chosen opportunity was seeded', () => {
    let s = createEmptyStage5AuthoringState();
    s = applySynthesisResult(s, 'rec_1');
    expect(() => composeStage5HandoffDocument({ state: s })).toThrow(/no chosen opportunity/);
  });

  it('emits a valid handoff document on the happy path', () => {
    let s = seedStage5Authoring(createEmptyStage5AuthoringState(), fakeChosen(), []);
    s = applySynthesisResult(s, 'rec_abc');

    const doc = composeStage5HandoffDocument({ state: s });

    // chosen-opportunity ref consistency
    expect(doc.chosenOpportunity.id).toBe('opp_chosen');
    // recommendation ref consistency
    expect(doc.synthesizedRecommendationId).toBe('rec_abc');
    // composedAt stamped as ISO-8601
    expect(doc.composedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // reserves preserved (empty in this case)
    expect(doc.reserveOpportunities).toEqual([]);
  });

  it('preserves the reserves on the handoff document', () => {
    let s = seedStage5Authoring(createEmptyStage5AuthoringState(), fakeChosen(), [
      { id: 'r1', painPointSummary: 'res 1', agentVerdict: 'pursue', founderVerdict: 'pursue_with_caveats', agentReasoning: 'r', layerASummary: null, layerBSummary: null, rank: 1 },
      { id: 'r2', painPointSummary: 'res 2', agentVerdict: 'pursue', founderVerdict: null,                  agentReasoning: 'r', layerASummary: null, layerBSummary: null, rank: 2 },
    ]);
    s = applySynthesisResult(s, 'rec_abc');

    const doc = composeStage5HandoffDocument({ state: s });

    expect(doc.reserveOpportunities).toHaveLength(2);
    expect(doc.reserveOpportunities[0].id).toBe('r1');
    expect(doc.reserveOpportunities[0].rank).toBe(1);
  });
});
