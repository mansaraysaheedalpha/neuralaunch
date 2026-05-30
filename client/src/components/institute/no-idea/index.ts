// src/components/institute/no-idea/index.ts
//
// Public barrel for the Institute No-Idea primitives. PR 10 adds the
// Stage 2 Skill Canvas surface; later PRs add Stage 3 (pain inventory),
// Stage 4 (opportunity evaluation), Stage 5 (recommendation handoff).

export { OpportunityDocket } from './OpportunityDocket';
export type { OpportunityDocketProps } from './OpportunityDocket';
export { DocketRow } from './DocketRow';
export type { DocketRowProps } from './DocketRow';
export { OpportunityFocus } from './OpportunityFocus';
export type { OpportunityFocusProps } from './OpportunityFocus';
export {
  layerAGlyph,
  layerBGlyph,
  isFeatured,
  countAdvancing,
} from './signalGlyph';
export type { GlyphTone, LayerGlyph } from './signalGlyph';

export { PainLedger } from './PainLedger';
export type { PainLedgerProps } from './PainLedger';
export { PainRow } from './PainRow';
export type { PainRowProps } from './PainRow';
export { DotScore } from './DotScore';
export type { DotScoreProps } from './DotScore';
export { ScoutStrip } from './ScoutStrip';
export type { ScoutStripProps } from './ScoutStrip';
export { ShortlistPanel } from './ShortlistPanel';
export type { ShortlistPanelProps } from './ShortlistPanel';
export {
  signalWeight,
  signalGlyph,
  scoreSum,
  painVerdict,
  countViable,
  getScores,
} from './signalWeight';
export type { SignalWeight, Verdict } from './signalWeight';

export { SkillGrid }       from './SkillGrid';
export { SkillRow }        from './SkillRow';
export { ExpectedProfilePanel } from './ExpectedProfilePanel';
export { StructuralBlocker }    from './StructuralBlocker';
export type { SkillGridProps }            from './SkillGrid';
export type { SkillRowProps }             from './SkillRow';
export type { ExpectedProfilePanelProps } from './ExpectedProfilePanel';
export type { StructuralBlockerProps, StructuralBlockerChoice } from './StructuralBlocker';
export {
  TIER_LABEL,
  TIER_ROMAN,
  TIER_ORDER,
  TIER_RANK,
  TIER_CHIP_CLASS,
  TIER_GLYPH,
  TIER_GLYPH_TONE,
} from './skillTierStyle';
