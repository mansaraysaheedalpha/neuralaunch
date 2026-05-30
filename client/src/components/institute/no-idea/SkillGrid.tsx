'use client';
// src/components/institute/no-idea/SkillGrid.tsx
//
// The full 14-row skill canvas — grid header + 14 SkillRow children.
// Click-to-set per row; the parent owns persistence via `onSet`. The
// existing dnd-kit drag is deliberately not preserved on the new
// per-lane grid: drag was natural over the old column-of-chips
// layout, but the lane-per-cell layout is faster + more discoverable
// with click (see no-idea-audit.html). Persistence path is unchanged.

import { SKILL_KEYS, type SkillKey, type SkillTier } from '@neuralaunch/constants';
import { SkillRow } from './SkillRow';
import { TIER_ORDER, TIER_LABEL, TIER_ROMAN } from './skillTierStyle';

const ROMAN_LOWER = [
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii',
  'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv',
];

export interface SkillGridProps {
  /** Current tiers for the active person (founder OR a teammate). */
  tiers:         Record<SkillKey, SkillTier>;
  /** Expected tier per skill, from the derived Expected Profile. */
  expectedByKey: Partial<Record<SkillKey, SkillTier>>;
  onSet:         (skill: SkillKey, tier: SkillTier) => void;
  readOnly?:     boolean;
}

export function SkillGrid({ tiers, expectedByKey, onSet, readOnly }: SkillGridProps) {
  return (
    <div>
      {/* Grid head */}
      <div className="grid grid-cols-[140px_repeat(4,1fr)] items-end border-b border-rule pb-3.5 lg:grid-cols-[240px_repeat(4,1fr)]">
        <div className="px-3.5 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Skill · 14 · click a lane to set
        </div>
        {TIER_ORDER.map((tier) => (
          <div
            key={tier}
            className={[
              'px-3.5 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.18em]',
              tier === 'good' ? 'text-accent' : 'text-muted',
            ].join(' ')}
          >
            <span className="mb-1 hidden font-serif text-[18px] font-normal italic normal-case tracking-[-0.01em] text-accent lg:block">
              {TIER_ROMAN[tier]}
            </span>
            {TIER_LABEL[tier]}
          </div>
        ))}
      </div>

      {/* 14 skill rows */}
      {SKILL_KEYS.map((skill, i) => (
        <SkillRow
          key={skill}
          skill={skill}
          roman={`${ROMAN_LOWER[i]}.`}
          currentTier={tiers[skill] ?? 'unknown'}
          expectedTier={expectedByKey[skill] ?? null}
          onSet={(t) => onSet(skill, t)}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
