// src/lib/ideation/stage2-requirements/composer.test.ts
//
// Tests the composer's deterministic post-LLM flow:
//   - The LLM call is mocked (withModelFallback short-circuits to
//     a canned implications array)
//   - We verify constraint computation, implication padding,
//     structural-blocker derivation, and Zod schema validation
//
// These tests catch regressions that the pure-helper tests
// (constraints, state) wouldn't — specifically the composer's
// stitching layer between deterministic skeleton + LLM prose.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Stub server-helpers (HttpError + renderUserContent) so we don't
// drag in next-auth / next/server at module load.
vi.mock('@/lib/validation/server-helpers', () => {
  class HttpError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = 'HttpError';
    }
  }
  // renderUserContent: identity-ish for tests (wraps in delimiters
  // the same way prod does so any assertions on prompt content
  // still hold the shape).
  function renderUserContent(value: unknown, _maxLen?: number): string {
    const s = typeof value === 'string' ? value : String(value);
    return s ? `[[[${s}]]]` : '[[[EMPTY]]]';
  }
  return { HttpError, renderUserContent };
});

// Mock withModelFallback — the only LLM-touching surface in the
// composer. Tests set the next return value via mocks.withModelFallback.
const mocks = vi.hoisted(() => ({
  withModelFallback: vi.fn(),
}));
vi.mock('@/lib/ai/with-model-fallback', () => ({
  withModelFallback: mocks.withModelFallback,
}));

// Mock observability — withAgentSpan just runs the factory with a
// no-op setAttr. The attribute constants are exported as plain
// strings; the runner only needs the function shape.
vi.mock('@/lib/observability', () => ({
  withAgentSpan: (_opts: unknown, run: (setAttr: () => void) => Promise<unknown>) =>
    run(() => undefined),
  ATTR_AGENT_TIER:       'agent.tier',
  ATTR_AGENT_MODEL:      'agent.model',
  ATTR_TOKENS_INPUT:     'tokens.input',
  ATTR_TOKENS_OUTPUT:    'tokens.output',
  ATTR_LATENCY_TOTAL_MS: 'latency.total_ms',
}));

// Skip the prompt-cache wiring entirely — the LLM call is bypassed
// so the messages array never reaches a provider.
vi.mock('@/lib/ai/prompt-cache', () => ({
  cachedUserMessages: (stable: string, volatile: string) => [
    { role: 'user', content: `${stable}\n\n${volatile}` },
  ],
}));

// Re-import composer after mocks are set up.
import { composeRequirementsDocument } from './composer';
import {
  createEmptyStage2AuthoringState,
  createEmptySkillInventory,
  createEmptyPersonSkills,
} from './state';
import type {
  Stage2AuthoringState,
  ExpectedProfileEntry,
  SkillInventory,
} from './schema';
import type { OutcomeDocument } from '../stage1-outcome/schema';

beforeEach(() => {
  mocks.withModelFallback.mockReset();
  // Sensible default — tests override with mockResolvedValueOnce for
  // specific implication content. Composer never calls withModelFallback
  // when there are no constraints, so this default just protects
  // happy-path tests that don't care about implication text.
  mocks.withModelFallback.mockResolvedValue({ implications: ['stub implication'] });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeOutcomeDoc(): OutcomeDocument {
  return {
    dimensions: {
      timeHorizon:         { value: '6-18mo',         confidence: 0.8, extractedAt: null },
      financialGoal:       { value: { shape: 'venture_scale', target: '$5M ARR' }, confidence: 0.8, extractedAt: null },
      riskTolerance:       { value: 'high',           confidence: 0.8, extractedAt: null },
      lifestylePreference: { value: 'fundable_startup', confidence: 0.8, extractedAt: null },
    },
    synthesisParagraph: 'A coherent picture',
    rulesOut:           'Rules out things',
    recommendedActions: [],
  };
}

function entry(over: Partial<ExpectedProfileEntry> = {}): ExpectedProfileEntry {
  return {
    skill:        'sales',
    requiredTier: 'good',
    critical:     true,
    reasoning:    'Reasoning',
    sources:      ['lifestylePreference=fundable_startup'],
    pushback:     null,
    ...over,
  };
}

function authoringWith(
  workingExpectedProfile: ExpectedProfileEntry[] | null,
  inventoryOverride: Partial<SkillInventory> = {},
): Stage2AuthoringState {
  const base = createEmptyStage2AuthoringState();
  return {
    ...base,
    workingExpectedProfile,
    workingInventory: { ...createEmptySkillInventory(), ...inventoryOverride },
  };
}

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

describe('composeRequirementsDocument — preconditions', () => {
  it('throws when workingExpectedProfile is null', async () => {
    const state = authoringWith(null);
    await expect(
      composeRequirementsDocument({ state, outcomeDocument: fakeOutcomeDoc() }),
    ).rejects.toThrow(/workingExpectedProfile is empty/);
  });

  it('throws when workingExpectedProfile is empty array', async () => {
    const state = authoringWith([]);
    await expect(
      composeRequirementsDocument({ state, outcomeDocument: fakeOutcomeDoc() }),
    ).rejects.toThrow(/workingExpectedProfile is empty/);
  });
});

// ---------------------------------------------------------------------------
// Implication stitching
// ---------------------------------------------------------------------------

describe('composeRequirementsDocument — implication stitching', () => {
  it('stitches LLM implications onto constraints in order', async () => {
    // Inventory with founder=bad on sales → 'good' required → structural gap.
    const inv = createEmptySkillInventory();
    inv.founder.tiers.sales = 'bad';
    inv.founder.tiers.programming = 'bad';
    const state = authoringWith([
      entry({ skill: 'sales',       requiredTier: 'good' }),
      entry({ skill: 'programming', requiredTier: 'good' }),
    ], inv);

    mocks.withModelFallback.mockResolvedValueOnce({
      implications: [
        'Sales gap rules out venture-scale outbound paths.',
        'Programming gap blocks product-led growth.',
      ],
    });

    const doc = await composeRequirementsDocument({
      state,
      outcomeDocument: fakeOutcomeDoc(),
    });

    expect(doc.constraints).toHaveLength(2);
    expect(doc.constraints[0].skill).toBe('sales');
    expect(doc.constraints[0].implication).toBe('Sales gap rules out venture-scale outbound paths.');
    expect(doc.constraints[1].skill).toBe('programming');
    expect(doc.constraints[1].implication).toBe('Programming gap blocks product-led growth.');
  });

  it('pads with empty strings when the LLM returns fewer implications than constraints', async () => {
    const inv = createEmptySkillInventory();
    inv.founder.tiers.sales = 'bad';
    inv.founder.tiers.programming = 'bad';
    const state = authoringWith([
      entry({ skill: 'sales',       requiredTier: 'good' }),
      entry({ skill: 'programming', requiredTier: 'good' }),
    ], inv);

    mocks.withModelFallback.mockResolvedValueOnce({
      implications: ['Only one implication produced'],
    });

    const doc = await composeRequirementsDocument({
      state,
      outcomeDocument: fakeOutcomeDoc(),
    });

    expect(doc.constraints).toHaveLength(2);
    expect(doc.constraints[0].implication).toBe('Only one implication produced');
    expect(doc.constraints[1].implication).toBe('');
  });

  it('drops extras when the LLM returns more implications than constraints', async () => {
    const inv = createEmptySkillInventory();
    inv.founder.tiers.sales = 'bad';
    const state = authoringWith([
      entry({ skill: 'sales', requiredTier: 'good' }),
    ], inv);

    mocks.withModelFallback.mockResolvedValueOnce({
      implications: ['first', 'second', 'third'],
    });

    const doc = await composeRequirementsDocument({
      state,
      outcomeDocument: fakeOutcomeDoc(),
    });

    expect(doc.constraints).toHaveLength(1);
    expect(doc.constraints[0].implication).toBe('first');
  });

  it('skips the LLM call when there are no constraints', async () => {
    // Inventory met by founder → no constraints. Composer should
    // assemble without calling withModelFallback.
    const inv = createEmptySkillInventory();
    inv.founder.tiers.sales = 'good';
    const state = authoringWith([
      entry({ skill: 'sales', requiredTier: 'good' }),
    ], inv);

    const doc = await composeRequirementsDocument({
      state,
      outcomeDocument: fakeOutcomeDoc(),
    });
    expect(doc.constraints).toHaveLength(0);
    expect(mocks.withModelFallback).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Structural blocker derivation
// ---------------------------------------------------------------------------

describe('composeRequirementsDocument — structural blocker', () => {
  it('triggers the blocker when >= 2 critical structural/blind-spot constraints', async () => {
    const inv = createEmptySkillInventory();
    inv.founder.tiers.sales = 'bad';
    inv.founder.tiers.programming = 'bad';
    const state = authoringWith([
      entry({ skill: 'sales',       requiredTier: 'good', critical: true }),
      entry({ skill: 'programming', requiredTier: 'good', critical: true }),
    ], inv);

    mocks.withModelFallback.mockResolvedValueOnce({
      implications: ['a', 'b'],
    });

    const doc = await composeRequirementsDocument({
      state,
      outcomeDocument: fakeOutcomeDoc(),
    });
    expect(doc.structuralBlocker.triggered).toBe(true);
  });

  it('does NOT trigger the blocker when constraints are non-critical', async () => {
    const inv = createEmptySkillInventory();
    inv.founder.tiers.sales = 'bad';
    inv.founder.tiers.programming = 'bad';
    const state = authoringWith([
      entry({ skill: 'sales',       requiredTier: 'good', critical: false }),
      entry({ skill: 'programming', requiredTier: 'good', critical: false }),
    ], inv);

    mocks.withModelFallback.mockResolvedValueOnce({
      implications: ['a', 'b'],
    });

    const doc = await composeRequirementsDocument({
      state,
      outcomeDocument: fakeOutcomeDoc(),
    });
    expect(doc.structuralBlocker.triggered).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Snapshot fields — inventory, recommendedActions, researchLog
// ---------------------------------------------------------------------------

describe('composeRequirementsDocument — artifact assembly', () => {
  it('copies the working inventory into skillInventorySnapshot', async () => {
    const inv = createEmptySkillInventory();
    inv.founder.tiers.sales = 'good';
    inv.team = [createEmptyPersonSkills('Maya')];
    const state = authoringWith([
      entry({ skill: 'sales', requiredTier: 'good' }),
    ], inv);

    const doc = await composeRequirementsDocument({
      state,
      outcomeDocument: fakeOutcomeDoc(),
    });
    expect(doc.skillInventorySnapshot.team).toHaveLength(1);
    expect(doc.skillInventorySnapshot.team[0].name).toBe('Maya');
    expect(doc.skillInventorySnapshot.founder.tiers.sales).toBe('good');
  });

  it('carries recommendedActions through unchanged', async () => {
    const state = authoringWith([entry({ skill: 'sales', requiredTier: 'good' })]);
    state.recommendedActions = [{
      action:          'talk to three founders',
      severity:        'strongly_advised',
      raisedAt:        '2026-05-12T00:00:00.000Z',
      status:          'pending',
      founderResponse: null,
    }];

    const doc = await composeRequirementsDocument({
      state,
      outcomeDocument: fakeOutcomeDoc(),
    });
    expect(doc.recommendedActions).toHaveLength(1);
    expect(doc.recommendedActions[0].action).toBe('talk to three founders');
  });

  it('writes composedAt as an ISO timestamp', async () => {
    const state = authoringWith([entry({ skill: 'sales', requiredTier: 'good' })]);
    const doc = await composeRequirementsDocument({
      state,
      outcomeDocument: fakeOutcomeDoc(),
    });
    expect(() => new Date(doc.composedAt).toISOString()).not.toThrow();
  });
});
