'use client';
// src/components/institute/no-idea/SkillRow.tsx
//
// One row of the skill canvas. 5-column grid:
//   [240px skill name] [Strong] [Adequate] [Weak] [Unknown]
//
// The active lane renders the chip in tier-specific typography (see
// skillTierStyle); the other three lanes render empty but clickable.
// When `expectedTier` differs from `currentTier`, a dashed accent pip
// floats at the top of the expected lane — that's the Expected
// Profile "ghost" marker, the spec's headline visual.

import type { SkillKey, SkillTier } from '@neuralaunch/constants';
import { SKILL_LABELS } from '@/components/ideation/labels';
import {
  TIER_ORDER,
  TIER_LABEL,
  TIER_CHIP_CLASS,
  TIER_GLYPH,
  TIER_GLYPH_TONE,
} from './skillTierStyle';

export interface SkillRowProps {
  skill:        SkillKey;
  /** Roman numeral with trailing dot — "i.", "ii.", … "xiv.". */
  roman:        string;
  currentTier:  SkillTier;
  /** The tier the Expected Profile demands — null when no profile. */
  expectedTier: SkillTier | null;
  /** Fires when the founder clicks a lane to set the tier. */
  onSet:        (tier: SkillTier) => void;
  readOnly?:    boolean;
}

export function SkillRow({
  skill,
  roman,
  currentTier,
  expectedTier,
  onSet,
  readOnly,
}: SkillRowProps) {
  return (
    <div className="relative grid grid-cols-[140px_repeat(4,1fr)] items-stretch border-b border-rule hover:bg-[rgba(255,255,255,0.02)] lg:grid-cols-[240px_repeat(4,1fr)]">
      <div className="flex items-center gap-2 py-3.5 pr-3.5 text-[14.5px] text-fg-2">
        <span className="min-w-[28px] font-mono text-[9px] tracking-[0.04em] text-muted-2">{roman}</span>
        <span className="truncate">{SKILL_LABELS[skill]}</span>
      </div>
      {TIER_ORDER.map((tier) => {
        const isActive   = currentTier === tier;
        const isExpected = expectedTier === tier && !isActive;
        return (
          <button
            key={tier}
            type="button"
            onClick={() => !readOnly && onSet(tier)}
            disabled={readOnly}
            aria-label={`Set ${SKILL_LABELS[skill]} to ${TIER_LABEL[tier]}`}
            aria-pressed={isActive}
            className="
              relative flex items-center justify-center border-l border-rule px-2 py-1.5 transition-colors
              hover:bg-[rgba(255,90,60,0.04)] disabled:cursor-not-allowed disabled:hover:bg-transparent
            "
          >
            {isActive && (
              <span className={['inline-flex items-center gap-1.5 leading-tight', TIER_CHIP_CLASS[tier]].join(' ')}>
                <span aria-hidden="true" className={TIER_GLYPH_TONE[tier]}>{TIER_GLYPH[tier]}</span>
                {TIER_LABEL[tier]}
              </span>
            )}
            {isExpected && (
              <span
                aria-hidden="true"
                title="Required by your outcome"
                className="absolute left-1/2 top-1.5 size-2 -translate-x-1/2 rounded-full border border-dashed border-accent"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
