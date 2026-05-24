// src/lib/ideation/stage5-handoff/__tests__/render-founder-summary.test.ts
//
// Pure-function tests for renderFounderSummary. No LLM, no DB.
// Verifies the brief's contract:
//   - non-empty output from a minimal valid input
//   - all founder-typed strings get wrapped with the [[[ ]]] delimiter
//     (prompt-injection defence)
//   - enum values stay unwrapped (system constants, never user-typed)
//   - per-section char budgets are respected (truncation fires on
//     pathological input)

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Stub server-helpers so importing this file's module graph does not
// drag in next-auth → next/server at test-load time. The mock preserves
// the [[[…]]] delimiter shape so the prompt-injection canary assertions
// still work end-to-end. Truncation in the real helper happens via
// maxLen; the mock honours it via slice so over-budget assertions hold.
vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: unknown, maxLen = 600) => {
    const str = typeof s === 'string' ? s : String(s ?? '');
    const clean = str.slice(0, maxLen);
    return clean ? `[[[${clean}]]]` : '[[[EMPTY]]]';
  },
}));

// Stub the logger so a truncation warning doesn't blow up the test run.
vi.mock('@/lib/logger', () => ({
  logger: {
    child: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
  },
}));

import { renderFounderSummary } from '../render-founder-summary';
import { createEmptySkillInventory } from '../../stage2-requirements/state';
import type { OutcomeDocument } from '../../stage1-outcome/schema';
import type { RequirementsDocument } from '../../stage2-requirements/schema';
import type { PainInventoryDocument } from '../../stage3-opportunities/schema';
import type { ChosenOpportunitySnapshot } from '../schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fakeOutcomeDoc(overrides: Partial<OutcomeDocument> = {}): OutcomeDocument {
  return {
    dimensions: {
      timeHorizon:   { value: '6-18mo',                                            confidence: 0.9,  extractedAt: '2026-05-01T00:00:00.000Z' },
      financialGoal: { value: { shape: 'full_replacement', target: '£3k/month' },  confidence: 0.85, extractedAt: '2026-05-01T00:00:00.000Z' },
      riskTolerance: { value: 'moderate',                                          confidence: 0.8,  extractedAt: '2026-05-01T00:00:00.000Z' },
      lifestylePreference: { value: 'lifestyle_business',                          confidence: 0.9,  extractedAt: '2026-05-01T00:00:00.000Z' },
    },
    synthesisParagraph: 'The founder wants replacement income within a year via a lifestyle business.',
    rulesOut:           'Rules out venture-scale software with multi-year runway.',
    recommendedActions: [],
    ...overrides,
  };
}

function fakeRequirementsDoc(overrides: Partial<RequirementsDocument> = {}): RequirementsDocument {
  return {
    skillInventorySnapshot: createEmptySkillInventory(new Date('2026-05-01T00:00:00.000Z')),
    expectedProfile: [
      { skill: 'sales',       requiredTier: 'good',       critical: true,  reasoning: 'needed', sources: [],  pushback: null },
      { skill: 'programming', requiredTier: 'acceptable', critical: false, reasoning: 'helps',  sources: [],  pushback: null },
    ],
    constraints: [
      { skill: 'sales', requiredTier: 'good', actualTier: 'acceptable', gap: 'mild', critical: true,
        implication: 'Sales gap may slow customer acquisition substantially.' },
    ],
    recommendedActions: [],
    structuralBlocker:  { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
    researchLog:        [],
    composedAt:         '2026-05-02T00:00:00.000Z',
    ...overrides,
  };
}

function fakePainInventoryDoc(overrides: Partial<PainInventoryDocument> = {}): PainInventoryDocument {
  return {
    painPointsSnapshot: [
      {
        id:                   'pp1',
        description:          'Marketing teams struggle to attribute spend across channels.',
        source:               'agent',
        evidenceUrl:          'https://example.com/post',
        evidenceExcerpt:      'A user lamented attribution',
        communityOrigin:      'Hacker News thread',
        agentRelevanceNote:   'matches outcome',
        founderContext:       null,
        founderNotes:         'I see this pain weekly.',
        agentSuggestedScores: null,
        founderFinalScores:   { intensity: 4, frequency: 5, nicheSpecificity: 3 },
        combinedScore:        60,
        scorePushbackHistory: [],
        scorePushbackVersion: 0,
        status:               'rated',
      },
    ],
    shortlist:          ['pp1'],
    shortlistFloor:     3,
    shortlistTarget:    5,
    shortlistCap:       5,
    rulesOut:           'Other pains were rejected as too niche.',
    recommendedActions: [],
    researchLog:        [],
    composedAt:         '2026-05-03T00:00:00.000Z',
    ...overrides,
  };
}

function fakeChosen(painSummary = 'Marketing teams struggle to attribute spend across channels.'): ChosenOpportunitySnapshot {
  return {
    id:               'opp_a',
    painPointSummary: painSummary,
    agentVerdict:     'pursue',
    founderVerdict:   'pursue',
    agentReasoning:   'Strong market signal across the four dimensions.',
    layerASummary:    null,
    layerBSummary:    null,
  };
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe('renderFounderSummary — invariants', () => {
  it('returns a non-empty string from a minimal valid input', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc(),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out.length).toBeGreaterThan(200);
  });

  it('emits all three named section headers', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc(),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out).toContain('THE FOUNDER');
    expect(out).toContain('THEIR SKILLS + CONSTRAINTS');
    expect(out).toContain('THE PAIN THEY CHOSE');
  });
});

// ---------------------------------------------------------------------------
// Security — founder-typed content wrapping (prompt-injection defence)
// ---------------------------------------------------------------------------

describe('renderFounderSummary — security wrapping', () => {
  it('wraps the synthesis paragraph in the triple-bracket delimiter', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc({ synthesisParagraph: 'CANARY_SYNTHESIS_STRING' }),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out).toMatch(/\[\[\[CANARY_SYNTHESIS_STRING\]\]\]/);
  });

  it('wraps the rules-out string in the triple-bracket delimiter', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc({ rulesOut: 'CANARY_RULES_OUT' }),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out).toMatch(/\[\[\[CANARY_RULES_OUT\]\]\]/);
  });

  it('wraps the financial-goal target when present', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc({
        dimensions: {
          ...fakeOutcomeDoc().dimensions,
          financialGoal: { value: { shape: 'full_replacement', target: 'CANARY_TARGET' }, confidence: 0.9, extractedAt: null },
        },
      }),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out).toMatch(/\[\[\[CANARY_TARGET\]\]\]/);
  });

  it('wraps the pain-point description from the Stage 3 inventory', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc(),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc({
        painPointsSnapshot: [
          { ...fakePainInventoryDoc().painPointsSnapshot[0], description: 'CANARY_PAIN_DESC' },
        ],
      }),
      chosen:               fakeChosen('CANARY_PAIN_DESC'),
    });
    expect(out).toMatch(/\[\[\[CANARY_PAIN_DESC\]\]\]/);
  });

  it('wraps the constraint implication string', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc(),
      requirementsDocument: fakeRequirementsDoc({
        constraints: [
          { skill: 'sales', requiredTier: 'good', actualTier: 'bad', gap: 'structural', critical: true,
            implication: 'CANARY_IMPLICATION' },
        ],
      }),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out).toMatch(/\[\[\[CANARY_IMPLICATION\]\]\]/);
  });
});

// ---------------------------------------------------------------------------
// Security — enum values stay UNWRAPPED (system constants, not user data)
// ---------------------------------------------------------------------------

describe('renderFounderSummary — enum values unwrapped', () => {
  it('does NOT wrap timeHorizon enum value in delimiters', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc(),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out).toContain('Time horizon: 6-18mo');
    // Negative — must not appear wrapped.
    expect(out).not.toContain('[[[6-18mo]]]');
  });

  it('does NOT wrap risk tolerance enum value', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc(),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out).toContain('Risk tolerance: moderate');
    expect(out).not.toContain('[[[moderate]]]');
  });

  it('does NOT wrap skill / gap / tier enum values', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc(),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out).not.toContain('[[[sales]]]');
    expect(out).not.toContain('[[[good]]]');
    expect(out).not.toContain('[[[mild]]]');
  });
});

// ---------------------------------------------------------------------------
// Truncation — per-section budgets are enforced
// ---------------------------------------------------------------------------

describe('renderFounderSummary — char budget truncation', () => {
  it('truncates a pathologically long synthesis paragraph', () => {
    const huge = 'X'.repeat(10_000);
    const out  = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc({ synthesisParagraph: huge }),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    // Total output budget for the three sections caps out around 2200
    // (with section separators). 10k of canary content would otherwise
    // dominate; the slice keeps it bounded.
    expect(out.length).toBeLessThan(3000);
  });

  it('null financial-goal target renders the "not yet quantified" fallback', () => {
    const out = renderFounderSummary({
      outcomeDocument:      fakeOutcomeDoc({
        dimensions: {
          ...fakeOutcomeDoc().dimensions,
          financialGoal: { value: { shape: 'full_replacement', target: null }, confidence: 0.9, extractedAt: null },
        },
      }),
      requirementsDocument: fakeRequirementsDoc(),
      painInventoryDoc:     fakePainInventoryDoc(),
      chosen:               fakeChosen(),
    });
    expect(out).toContain('Target: not yet quantified');
  });
});
