// src/components/institute/no-idea/skillTierStyle.ts
//
// Single source of truth for tier→style mapping in the Institute
// skill canvas. Tiers are encoded TYPOGRAPHICALLY, not by lane
// background colour:
//
//   good       — Strong   — accent dot, mono medium, --fg
//   acceptable — Adequate — open hairline circle, mono, --fg-2
//   bad        — Weak     — accent em-dash, serif italic, --muted
//   unknown    — Unknown  — italic "?", --muted-2
//
// Only Strong carries the accent dot. Weak is italic. Nothing is red.
// Red weaknesses make the founder stare at their failures in
// destructive-action colour — the new treatment is calm and
// self-assessment-shaped (see no-idea-audit.html Stage II rationale).

import type { SkillTier } from '@neuralaunch/constants';

/** Display label per tier (the founder-facing word). */
export const TIER_LABEL: Record<SkillTier, string> = {
  good:       'Strong',
  acceptable: 'Adequate',
  bad:        'Weak',
  unknown:    'Unknown',
};

/** Roman-numeral index per tier (for the grid head). */
export const TIER_ROMAN: Record<SkillTier, string> = {
  good:       'i.',
  acceptable: 'ii.',
  bad:        'iii.',
  unknown:    'iv.',
};

/** Lane ordering left→right in the grid. */
export const TIER_ORDER = ['good', 'acceptable', 'bad', 'unknown'] as const satisfies readonly SkillTier[];

/** Numeric rank for tier comparisons (good highest). */
export const TIER_RANK: Record<SkillTier, number> = {
  good:       3,
  acceptable: 2,
  bad:        1,
  unknown:    0,
};

/** Chip typography per tier — applied to the active-lane chip text. */
export const TIER_CHIP_CLASS: Record<SkillTier, string> = {
  good:       'font-mono font-medium uppercase tracking-[0.06em] text-fg text-[10.5px]',
  acceptable: 'font-mono uppercase tracking-[0.04em] text-fg-2 text-[10.5px]',
  bad:        'font-serif italic text-muted text-[13px]',
  unknown:    'font-serif italic text-muted-2 text-[11px]',
};

/** Per-tier leading glyph (rendered before the label). */
export const TIER_GLYPH: Record<SkillTier, string> = {
  good:       '●',
  acceptable: '○',
  bad:        '—',
  unknown:    '?',
};

/** Tone the leading glyph is painted in. */
export const TIER_GLYPH_TONE: Record<SkillTier, string> = {
  good:       'text-accent',
  acceptable: 'text-rule-strong',
  bad:        'text-accent',
  unknown:    'text-muted',
};
