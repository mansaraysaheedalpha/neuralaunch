// src/lib/ideation/stage2-requirements/constraints.test.ts
//
// Pure deterministic gap-computation tests. No mocks needed.

import { describe, it, expect } from 'vitest';
import { computeStrongestTier, classifyGap, computeConstraints } from './constraints';
import { createEmptyPersonSkills, createEmptySkillInventory } from './state';
import type { ExpectedProfileEntry, SkillInventory } from './schema';

function entry(over: Partial<ExpectedProfileEntry> = {}): ExpectedProfileEntry {
  return {
    skill:        'sales',
    requiredTier: 'good',
    critical:     true,
    reasoning:    '',
    sources:      [],
    pushback:     null,
    ...over,
  };
}

function inventoryWithTiers(
  founderTiers: Partial<Record<string, 'good' | 'acceptable' | 'bad' | 'unknown'>>,
  teamTiers:    Array<Partial<Record<string, 'good' | 'acceptable' | 'bad' | 'unknown'>>> = [],
): SkillInventory {
  const inv = createEmptySkillInventory();
  for (const k in founderTiers) {
    inv.founder.tiers[k as keyof typeof inv.founder.tiers] = founderTiers[k]!;
  }
  inv.team = teamTiers.map((t, i) => {
    const p = createEmptyPersonSkills(`Teammate ${i + 1}`);
    for (const k in t) p.tiers[k as keyof typeof p.tiers] = t[k]!;
    return p;
  });
  return inv;
}

// ---------------------------------------------------------------------------
// computeStrongestTier
// ---------------------------------------------------------------------------

describe('computeStrongestTier', () => {
  it('returns the founder tier when no team', () => {
    const inv = inventoryWithTiers({ sales: 'acceptable' });
    expect(computeStrongestTier(inv, 'sales')).toBe('acceptable');
  });

  it('picks the highest tier across founder + team', () => {
    const inv = inventoryWithTiers(
      { sales: 'bad' },
      [{ sales: 'good' }, { sales: 'acceptable' }],
    );
    expect(computeStrongestTier(inv, 'sales')).toBe('good');
  });

  it("ignores 'unknown' when a known tier exists on someone", () => {
    const inv = inventoryWithTiers(
      { sales: 'unknown' },
      [{ sales: 'bad' }],
    );
    expect(computeStrongestTier(inv, 'sales')).toBe('bad');
  });

  it("returns 'unknown' only when literally everyone is unknown", () => {
    const inv = inventoryWithTiers(
      { sales: 'unknown' },
      [{ sales: 'unknown' }, { sales: 'unknown' }],
    );
    expect(computeStrongestTier(inv, 'sales')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// classifyGap
// ---------------------------------------------------------------------------

describe('classifyGap', () => {
  it('returns null when actual >= required', () => {
    expect(classifyGap('good', 'good')).toBe(null);
    expect(classifyGap('acceptable', 'good')).toBe(null);
    expect(classifyGap('bad', 'acceptable')).toBe(null);
  });

  it("returns 'mild' for 1-tier gaps", () => {
    expect(classifyGap('good', 'acceptable')).toBe('mild');
    expect(classifyGap('acceptable', 'bad')).toBe('mild');
  });

  it("returns 'structural' for 2-tier gaps", () => {
    expect(classifyGap('good', 'bad')).toBe('structural');
  });

  it("returns 'blind_spot' when actual = 'unknown'", () => {
    expect(classifyGap('good', 'unknown')).toBe('blind_spot');
    expect(classifyGap('acceptable', 'unknown')).toBe('blind_spot');
    expect(classifyGap('bad', 'unknown')).toBe('blind_spot');
  });

  it("returns null when required = 'unknown' (degenerate case)", () => {
    expect(classifyGap('unknown', 'good')).toBe(null);
    expect(classifyGap('unknown', 'unknown')).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// computeConstraints — integration
// ---------------------------------------------------------------------------

describe('computeConstraints', () => {
  it('drops entries where the requirement is met', () => {
    const inv = inventoryWithTiers({ sales: 'good' });
    const constraints = computeConstraints(inv, [entry({ skill: 'sales', requiredTier: 'good' })]);
    expect(constraints).toHaveLength(0);
  });

  it('produces one constraint per unmet entry, ordered as input', () => {
    const inv = inventoryWithTiers({
      sales: 'bad',
      marketing: 'acceptable',
      programming: 'unknown',
    });
    const constraints = computeConstraints(inv, [
      entry({ skill: 'sales',       requiredTier: 'good' }),
      entry({ skill: 'marketing',   requiredTier: 'good' }),
      entry({ skill: 'programming', requiredTier: 'good' }),
    ]);
    expect(constraints).toHaveLength(3);
    expect(constraints[0]).toMatchObject({ skill: 'sales',       gap: 'structural' });
    expect(constraints[1]).toMatchObject({ skill: 'marketing',   gap: 'mild' });
    expect(constraints[2]).toMatchObject({ skill: 'programming', gap: 'blind_spot' });
  });

  it("uses strongest-across-team for the gap distance", () => {
    const inv = inventoryWithTiers(
      { sales: 'bad' },
      [{ sales: 'good' }],
    );
    const constraints = computeConstraints(inv, [entry({ skill: 'sales', requiredTier: 'good' })]);
    expect(constraints).toHaveLength(0);
  });

  it('preserves the critical flag from the entry', () => {
    const inv = inventoryWithTiers({ sales: 'bad' });
    const constraints = computeConstraints(inv, [
      entry({ skill: 'sales', requiredTier: 'good', critical: false }),
    ]);
    expect(constraints[0].critical).toBe(false);
  });

  it("leaves implication empty (composer's LLM pass fills it in)", () => {
    const inv = inventoryWithTiers({ sales: 'bad' });
    const constraints = computeConstraints(inv, [entry({ skill: 'sales', requiredTier: 'good' })]);
    expect(constraints[0].implication).toBe('');
  });
});
