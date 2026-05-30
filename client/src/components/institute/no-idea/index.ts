// src/components/institute/no-idea/index.ts
//
// Public barrel for the Institute No-Idea primitives. PR 10 adds the
// Stage 2 Skill Canvas surface; later PRs add Stage 3 (pain inventory),
// Stage 4 (opportunity evaluation), Stage 5 (recommendation handoff).

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
