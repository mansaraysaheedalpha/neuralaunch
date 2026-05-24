// src/lib/ideation/stage5-handoff/__tests__/synthesis-bridge.test.ts
//
// Tests for runStage5SynthesisBridge — the thin delegate to
// runFinalSynthesis. The actual two-phase LLM call is mocked so we
// can exercise the bridge's contract without firing Anthropic:
//   - delegates to runFinalSynthesis with non-empty summary + analysis
//   - passes audienceType=null (Ideation pre-dates the classifier)
//   - forwards contextId, researchAccumulator, lifecycleBlock unchanged
//   - throws when any required input is null/undefined (defence-in-depth)

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
// Stub server-helpers — the renderer modules transitively import it,
// and importing it for real drags in next-auth → next/server at
// test-load time. The bridge itself does not call renderUserContent;
// the stub is only there to satisfy the renderer module graph.
vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: unknown, maxLen = 600) => {
    const str = typeof s === 'string' ? s : String(s ?? '');
    const clean = str.slice(0, maxLen);
    return clean ? `[[[${clean}]]]` : '[[[EMPTY]]]';
  },
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    child: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
  },
}));

// Mock runFinalSynthesis — we don't want to spin up the AI SDK,
// Anthropic, observability, research tools, etc. The bridge's job is
// just to render strings and delegate; mocking lets us verify it
// passes the right values without firing real LLM calls.
const runFinalSynthesisMock = vi.fn<(args: unknown) => Promise<unknown>>();
vi.mock('@/lib/discovery/synthesis-final', () => ({
  runFinalSynthesis: (args: unknown): Promise<unknown> => runFinalSynthesisMock(args),
}));

import { runStage5SynthesisBridge } from '../synthesis-bridge';
import { createEmptySkillInventory } from '../../stage2-requirements/state';
import type { OutcomeDocument } from '../../stage1-outcome/schema';
import type { RequirementsDocument } from '../../stage2-requirements/schema';
import type { PainInventoryDocument } from '../../stage3-opportunities/schema';
import type { OpportunityEvaluationsDocument } from '../../stage4-opportunities/schema';
import type { ChosenOpportunitySnapshot } from '../schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeOutcomeDoc(): OutcomeDocument {
  return {
    dimensions: {
      timeHorizon:   { value: '6-18mo',          confidence: 0.9, extractedAt: null },
      financialGoal: { value: { shape: 'full_replacement', target: null }, confidence: 0.85, extractedAt: null },
      riskTolerance: { value: 'moderate',         confidence: 0.8, extractedAt: null },
      lifestylePreference: { value: 'lifestyle_business', confidence: 0.9, extractedAt: null },
    },
    synthesisParagraph: 'Synthesis paragraph for the bridge test.',
    rulesOut:           'Rules out paragraph for the bridge test.',
    recommendedActions: [],
  };
}

function fakeRequirementsDoc(): RequirementsDocument {
  return {
    skillInventorySnapshot: createEmptySkillInventory(new Date('2026-05-01T00:00:00.000Z')),
    expectedProfile:        [{ skill: 'sales', requiredTier: 'good', critical: true, reasoning: 'needed', sources: [], pushback: null }],
    constraints:            [],
    recommendedActions:     [],
    structuralBlocker:      { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
    researchLog:            [],
    composedAt:             '2026-05-01T00:00:00.000Z',
  };
}

function fakePainInventoryDoc(): PainInventoryDocument {
  return {
    painPointsSnapshot: [],
    shortlist:          [],
    shortlistFloor:     3,
    shortlistTarget:    5,
    shortlistCap:       5,
    rulesOut:           '',
    recommendedActions: [],
    researchLog:        [],
    composedAt:         '2026-05-01T00:00:00.000Z',
  };
}

function fakeOpportunitySet(): OpportunityEvaluationsDocument {
  return {
    evaluations:         [],
    responsesSnapshot:   [],
    chosenOpportunityId: 'opp_chosen',
    chosenRationale:     'because',
    rejectedRationale:   'because',
    recommendedActions:  [],
    researchLog:         [],
    composedAt:          '2026-05-01T00:00:00.000Z',
  };
}

function fakeChosen(): ChosenOpportunitySnapshot {
  return {
    id:               'opp_chosen',
    painPointSummary: 'pain summary',
    agentVerdict:     'pursue',
    founderVerdict:   'pursue',
    agentReasoning:   'agent reasoning',
    layerASummary:    null,
    layerBSummary:    null,
  };
}

function fullArgs(overrides: Record<string, unknown> = {}) {
  return {
    outcomeDocument:      fakeOutcomeDoc(),
    requirementsDocument: fakeRequirementsDoc(),
    painInventoryDoc:     fakePainInventoryDoc(),
    opportunitySet:       fakeOpportunitySet(),
    chosen:               fakeChosen(),
    reserves:             [],
    contextId:            'sess_abc',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path — delegation
// ---------------------------------------------------------------------------

describe('runStage5SynthesisBridge — delegation', () => {
  beforeEach(() => {
    runFinalSynthesisMock.mockReset();
    runFinalSynthesisMock.mockResolvedValue({ summary: 'mocked recommendation' });
  });

  it('produces non-empty summary and analysis strings before delegating', async () => {
    await runStage5SynthesisBridge(fullArgs());

    expect(runFinalSynthesisMock).toHaveBeenCalledTimes(1);
    const passed = runFinalSynthesisMock.mock.calls[0][0] as {
      summary: string; analysis: string; audienceType: unknown; contextId: string;
    };
    expect(passed.summary.length).toBeGreaterThan(100);
    expect(passed.analysis.length).toBeGreaterThan(100);
  });

  it('forces audienceType=null per the brief (Ideation pre-dates the classifier)', async () => {
    await runStage5SynthesisBridge(fullArgs());

    const passed = runFinalSynthesisMock.mock.calls[0][0] as { audienceType: unknown };
    expect(passed.audienceType).toBeNull();
  });

  it('forwards contextId unchanged', async () => {
    await runStage5SynthesisBridge(fullArgs({ contextId: 'sess_xyz' }));

    const passed = runFinalSynthesisMock.mock.calls[0][0] as { contextId: string };
    expect(passed.contextId).toBe('sess_xyz');
  });

  it('forwards lifecycleBlock unchanged', async () => {
    await runStage5SynthesisBridge(fullArgs({ lifecycleBlock: 'CANARY_LIFECYCLE_BLOCK' }));

    const passed = runFinalSynthesisMock.mock.calls[0][0] as { lifecycleBlock: string };
    expect(passed.lifecycleBlock).toBe('CANARY_LIFECYCLE_BLOCK');
  });

  it('forwards researchAccumulator unchanged', async () => {
    const accumulator: unknown[] = [];
    await runStage5SynthesisBridge(fullArgs({ researchAccumulator: accumulator }));

    const passed = runFinalSynthesisMock.mock.calls[0][0] as { researchAccumulator: unknown[] };
    expect(passed.researchAccumulator).toBe(accumulator);
  });

  it('returns the Recommendation produced by runFinalSynthesis', async () => {
    runFinalSynthesisMock.mockResolvedValue({ summary: 'rec_from_mock' });
    const result = await runStage5SynthesisBridge(fullArgs());
    expect(result).toEqual({ summary: 'rec_from_mock' });
  });
});

// ---------------------------------------------------------------------------
// Defence-in-depth — input validation
// ---------------------------------------------------------------------------

describe('runStage5SynthesisBridge — input validation', () => {
  beforeEach(() => {
    runFinalSynthesisMock.mockReset();
    runFinalSynthesisMock.mockResolvedValue({});
  });

  // Each required input is null-tested explicitly because the caller
  // (commit #3 route) should be gating on readiness — but if a bug
  // slipped through, the bridge should throw with a clear message
  // rather than producing a malformed prompt.

  it('throws when outcomeDocument is missing', async () => {
    await expect(runStage5SynthesisBridge(fullArgs({ outcomeDocument: null })))
      .rejects.toThrow(/outcomeDocument is required/);
  });

  it('throws when requirementsDocument is missing', async () => {
    await expect(runStage5SynthesisBridge(fullArgs({ requirementsDocument: null })))
      .rejects.toThrow(/requirementsDocument is required/);
  });

  it('throws when painInventoryDoc is missing', async () => {
    await expect(runStage5SynthesisBridge(fullArgs({ painInventoryDoc: null })))
      .rejects.toThrow(/painInventoryDoc is required/);
  });

  it('throws when opportunitySet is missing', async () => {
    await expect(runStage5SynthesisBridge(fullArgs({ opportunitySet: null })))
      .rejects.toThrow(/opportunitySet is required/);
  });

  it('throws when chosen is missing', async () => {
    await expect(runStage5SynthesisBridge(fullArgs({ chosen: null })))
      .rejects.toThrow(/chosen opportunity snapshot is required/);
  });

  it('throws when contextId is missing', async () => {
    await expect(runStage5SynthesisBridge(fullArgs({ contextId: '' })))
      .rejects.toThrow(/contextId is required/);
  });

  it('does NOT throw when reserves is empty (valid state — single shortlist)', async () => {
    await expect(runStage5SynthesisBridge(fullArgs({ reserves: [] })))
      .resolves.toBeDefined();
  });
});
