// src/lib/discovery/synthesis-final.test.ts
//
// Pure-helper tests for validateRecommendationOrThrow — the
// fail-closed guard added on 2026-05-18 in response to a prod
// incident where an empty-but-schema-valid Recommendation reached
// the database (Recommendation.summary = "Let me research the
// competitive landscape…", every other field empty).
//
// The guard catches the class of bug where Anthropic emits the
// schema shape before doing the work. Tests cover:
//   1. Happy path (well-formed) returns rec unchanged
//   2. Each required string rejected when empty / whitespace-only
//   3. Each array rejected when below its advertised minimum
//   4. Nested object arrays rejected when sub-fields are empty
//   5. Multiple issues reported in a single error (debuggability)
//
// No LLM mocking — the validator is a pure function over a typed
// input. We intentionally test it in isolation from the two-phase
// generateText calls; the call shape is covered by the (unmocked)
// engine-level behaviour and is too brittle to mock meaningfully.

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Stub server-helpers + observability + AI providers so importing
// the engine module does not drag in next-auth, Sentry, or the AI
// SDK at test-load time. The validator does not call any of them.
vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: string) => `[[[${s}]]]`,
}));
vi.mock('@/lib/observability', () => ({
  withAgentSpan:           (_o: unknown, fn: (setAttr: () => void) => unknown) => Promise.resolve(fn(() => {})),
  setActiveSpanAttribute:  () => {},
  recordModelFallback:     () => {},
  ATTR_AGENT_TIER:         'agent.tier',
  ATTR_AGENT_MODEL:        'agent.model',
  ATTR_AGENT_AUDIENCE_TYPE:'agent.audience',
  ATTR_TOKENS_INPUT:       'tokens.in',
  ATTR_TOKENS_OUTPUT:      'tokens.out',
  ATTR_LATENCY_TOTAL_MS:   'latency.ms',
}));
vi.mock('@/lib/ai/with-model-fallback', () => ({
  withModelFallback: vi.fn(),
}));
vi.mock('@/lib/ai/prompt-cache', () => ({
  cachedUserMessages: () => [],
}));
vi.mock('@/lib/research', () => ({
  buildResearchTools:       () => ({}),
  getResearchToolGuidance:  () => '',
  RESEARCH_BUDGETS:         { recommendation: { steps: 10 } },
}));

import { validateRecommendationOrThrow } from './synthesis-final';
import type { Recommendation } from './recommendation-schema';

function makeValidRec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    summary:                'A clear two-sentence conclusion. Followed by the first move.',
    recommendationType:     'build_service',
    path:                   'Build a productised audit service for early-stage SaaS founders.',
    reasoning:              'You have the network and the credibility. Time-to-revenue is weeks, not months. Your prior consulting bookings prove demand.',
    firstThreeSteps: [
      'Draft a one-page audit offer at $2k flat',
      'Pitch five of your existing contacts this week',
      'Run the first audit and document the deliverables',
    ],
    timeToFirstResult:      '4 to 6 weeks to first paying client.',
    risks: [
      { risk: 'Underprice the first offer',     mitigation: 'Hold the floor at $2k, walk away below' },
      { risk: 'Scope creep on deliverables',    mitigation: 'Fixed 3-deliverable contract template' },
    ],
    assumptions: [
      'Network responds to direct outreach',
      'You can deliver the audit in under 10 hours',
    ],
    whatWouldMakeThisWrong: 'If your network is colder than you think OR if buyers do not value audits at $2k.',
    alternativeRejected: [
      { alternative: 'Build a SaaS product first', whyNotForThem: 'Multi-month build with no validated demand and your budget cannot cover it' },
      { alternative: 'Take a full-time job',       whyNotForThem: 'You have explicitly ruled out employment for the next 12 months' },
    ],
    ...overrides,
  };
}

describe('validateRecommendationOrThrow', () => {
  it('returns a well-formed recommendation unchanged', () => {
    const rec = makeValidRec();
    expect(validateRecommendationOrThrow(rec)).toBe(rec);
  });

  it.each([
    ['summary'],
    ['path'],
    ['reasoning'],
    ['timeToFirstResult'],
    ['whatWouldMakeThisWrong'],
  ] as const)('throws when %s is empty', (field) => {
    const rec = makeValidRec({ [field]: '' } as Partial<Recommendation>);
    expect(() => validateRecommendationOrThrow(rec)).toThrow(new RegExp(`${field} is empty`));
  });

  it.each([
    ['summary'],
    ['path'],
    ['reasoning'],
    ['timeToFirstResult'],
    ['whatWouldMakeThisWrong'],
  ] as const)('throws when %s is whitespace-only', (field) => {
    const rec = makeValidRec({ [field]: '   \n  ' } as Partial<Recommendation>);
    expect(() => validateRecommendationOrThrow(rec)).toThrow(new RegExp(`${field} is empty`));
  });

  it('throws when firstThreeSteps is empty', () => {
    const rec = makeValidRec({ firstThreeSteps: [] });
    expect(() => validateRecommendationOrThrow(rec)).toThrow(/firstThreeSteps has 0 entries/);
  });

  it('throws when firstThreeSteps has only one entry', () => {
    const rec = makeValidRec({ firstThreeSteps: ['only one'] });
    expect(() => validateRecommendationOrThrow(rec)).toThrow(/firstThreeSteps has 1 entries/);
  });

  it('throws when risks is below minimum', () => {
    const rec = makeValidRec({ risks: [{ risk: 'r', mitigation: 'm' }] });
    expect(() => validateRecommendationOrThrow(rec)).toThrow(/risks has 1 entries/);
  });

  it('throws when assumptions is below minimum', () => {
    const rec = makeValidRec({ assumptions: ['only one'] });
    expect(() => validateRecommendationOrThrow(rec)).toThrow(/assumptions has 1 entries/);
  });

  it('throws when alternativeRejected is empty', () => {
    const rec = makeValidRec({ alternativeRejected: [] });
    expect(() => validateRecommendationOrThrow(rec)).toThrow(/alternativeRejected has 0 entries/);
  });

  it('throws when a risk entry has an empty sub-field', () => {
    const rec = makeValidRec({
      risks: [
        { risk: 'real risk', mitigation: 'real mitigation' },
        { risk: '',          mitigation: 'orphaned' },
      ],
    });
    expect(() => validateRecommendationOrThrow(rec)).toThrow(/risks\[1\]\.risk is empty/);
  });

  it('throws when an alternativeRejected entry has an empty sub-field', () => {
    const rec = makeValidRec({
      alternativeRejected: [
        { alternative: 'first',  whyNotForThem: 'real reason' },
        { alternative: 'second', whyNotForThem: '' },
      ],
    });
    expect(() => validateRecommendationOrThrow(rec)).toThrow(/alternativeRejected\[1\]\.whyNotForThem is empty/);
  });

  it('reports all issues in a single error for debuggability', () => {
    // The 2026-05-18 prod row had this shape: summary populated with
    // pre-research narration, every other required field empty.
    const rec = makeValidRec({
      summary:             'Let me research the competitive landscape and market conditions before making a recommendation.',
      path:                '',
      reasoning:           '',
      firstThreeSteps:     [],
      timeToFirstResult:   '',
      risks:               [],
      assumptions:         [],
      whatWouldMakeThisWrong: '',
      alternativeRejected: [],
    });
    let err: unknown;
    try { validateRecommendationOrThrow(rec); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    // Must enumerate every issue, not bail on the first
    expect(msg).toMatch(/path is empty/);
    expect(msg).toMatch(/reasoning is empty/);
    expect(msg).toMatch(/timeToFirstResult is empty/);
    expect(msg).toMatch(/whatWouldMakeThisWrong is empty/);
    expect(msg).toMatch(/firstThreeSteps has 0 entries/);
    expect(msg).toMatch(/risks has 0 entries/);
    expect(msg).toMatch(/assumptions has 0 entries/);
    expect(msg).toMatch(/alternativeRejected has 0 entries/);
    // The summary string itself is valid (non-empty), so it should NOT
    // appear in the issue list — the empty-fields are the signal.
    expect(msg).not.toMatch(/summary is empty/);
  });
});
