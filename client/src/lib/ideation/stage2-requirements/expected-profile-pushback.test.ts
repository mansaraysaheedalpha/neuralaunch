// src/lib/ideation/stage2-requirements/expected-profile-pushback.test.ts
//
// Unit tests for the pure entry-mutation logic of the Expected
// Profile pushback engine. The two LLM phases (reasoning + emit)
// are not exercised here — they're contract-bound by Zod schemas in
// expected-profile-pushback.ts. What this tests is the action ->
// entry-shape rules: refine merges, replace rewrites, defend /
// continue_dialogue / closing leave the entry alone.

import { describe, it, expect, vi } from 'vitest';

// `expected-profile-pushback.ts` starts with `import 'server-only'`
// AND imports `renderUserContent` from `@/lib/validation/server-helpers`
// — that pulls in next-auth via the auth() side-effect, which won't
// resolve under vitest. We exercise only the pure
// `applyEntryMutation` helper here, so no-op stubs are enough.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/validation/server-helpers', () => ({
  renderUserContent: (s: unknown) =>
    typeof s === 'string' && s.length > 0 ? `[[[${s}]]]` : '[[[EMPTY]]]',
}));

import {
  applyEntryMutation,
  type PushbackRefinementPayload,
  type PushbackReplacementPayload,
} from './expected-profile-pushback';
import type { ExpectedProfileEntry } from './schema';

function entry(over: Partial<ExpectedProfileEntry> = {}): ExpectedProfileEntry {
  return {
    skill:        'sales',
    requiredTier: 'good',
    critical:     true,
    reasoning:    'Initial reasoning',
    sources:      ['lifestylePreference=fundable_startup'],
    pushback:     null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// defend / continue_dialogue / closing — entry unchanged
// ---------------------------------------------------------------------------

describe('applyEntryMutation — non-mutating actions', () => {
  it.each(['defend', 'continue_dialogue', 'closing'] as const)(
    "leaves the entry unchanged for action='%s'",
    (action) => {
      const e = entry();
      const next = applyEntryMutation(e, action, null, null);
      expect(next).toEqual(e);
    },
  );

  it("ignores any refinement / replacement payload provided alongside a non-mutating action", () => {
    const e = entry();
    const refinement: PushbackRefinementPayload = {
      requiredTier: 'acceptable',
      critical:     null,
      reasoning:    null,
      sources:      null,
    };
    const replacement: PushbackReplacementPayload = {
      requiredTier: 'bad',
      critical:     false,
      reasoning:    'new',
      sources:      [],
    };
    expect(applyEntryMutation(e, 'defend', refinement, replacement)).toEqual(e);
  });
});

// ---------------------------------------------------------------------------
// refine — merges non-null fields, preserves the rest
// ---------------------------------------------------------------------------

describe("applyEntryMutation — action='refine'", () => {
  it('merges only the non-null refinement fields', () => {
    const e = entry();
    const refinement: PushbackRefinementPayload = {
      requiredTier: 'acceptable',
      critical:     null,
      reasoning:    null,
      sources:      null,
    };
    const next = applyEntryMutation(e, 'refine', refinement, null);
    expect(next.requiredTier).toBe('acceptable');
    expect(next.critical).toBe(true);            // unchanged
    expect(next.reasoning).toBe('Initial reasoning');
    expect(next.sources).toEqual(['lifestylePreference=fundable_startup']);
  });

  it('refines multiple fields at once', () => {
    const e = entry();
    const refinement: PushbackRefinementPayload = {
      requiredTier: 'acceptable',
      critical:     false,
      reasoning:    'refined reasoning',
      sources:      ['lifestylePreference=fundable_startup', 'research:new'],
    };
    const next = applyEntryMutation(e, 'refine', refinement, null);
    expect(next).toEqual({
      ...e,
      requiredTier: 'acceptable',
      critical:     false,
      reasoning:    'refined reasoning',
      sources:      ['lifestylePreference=fundable_startup', 'research:new'],
    });
  });

  it('falls through to non-mutating behaviour when refinement is null', () => {
    const e = entry();
    expect(applyEntryMutation(e, 'refine', null, null)).toEqual(e);
  });

  it('preserves the pushback field on the entry', () => {
    const e = entry({
      pushback: {
        history: [],
        version: 0,
        status:  'open',
      },
    });
    const refinement: PushbackRefinementPayload = {
      requiredTier: 'acceptable',
      critical:     null,
      reasoning:    null,
      sources:      null,
    };
    const next = applyEntryMutation(e, 'refine', refinement, null);
    expect(next.pushback).toEqual(e.pushback);
  });
});

// ---------------------------------------------------------------------------
// replace — overwrites the entry with the replacement payload
// ---------------------------------------------------------------------------

describe("applyEntryMutation — action='replace'", () => {
  it('overwrites requiredTier / critical / reasoning / sources with the replacement', () => {
    const e = entry();
    const replacement: PushbackReplacementPayload = {
      requiredTier: 'bad',
      critical:     false,
      reasoning:    'new reasoning',
      sources:      ['research:replacement-source'],
    };
    const next = applyEntryMutation(e, 'replace', null, replacement);
    expect(next.requiredTier).toBe('bad');
    expect(next.critical).toBe(false);
    expect(next.reasoning).toBe('new reasoning');
    expect(next.sources).toEqual(['research:replacement-source']);
  });

  it('preserves the skill field (cannot be rewritten — that would be a different entry)', () => {
    const e = entry({ skill: 'programming' });
    const replacement: PushbackReplacementPayload = {
      requiredTier: 'bad',
      critical:     false,
      reasoning:    'r',
      sources:      ['s'],
    };
    expect(applyEntryMutation(e, 'replace', null, replacement).skill).toBe('programming');
  });

  it('preserves the pushback state', () => {
    const e = entry({
      pushback: {
        history: [],
        version: 2,
        status:  'open',
      },
    });
    const replacement: PushbackReplacementPayload = {
      requiredTier: 'bad',
      critical:     false,
      reasoning:    'r',
      sources:      [],
    };
    expect(applyEntryMutation(e, 'replace', null, replacement).pushback).toEqual(e.pushback);
  });

  it('falls through to non-mutating behaviour when replacement is null', () => {
    const e = entry();
    expect(applyEntryMutation(e, 'replace', null, null)).toEqual(e);
  });
});
