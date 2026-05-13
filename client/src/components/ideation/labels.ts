// src/components/ideation/labels.ts
//
// Human-readable labels for the Stage 2 skill / tier / severity
// enums. Shared across every UI surface that renders skills or
// tiers (SkillCanvas, ExpectedProfileView, ConstraintsList,
// RequirementsDocumentView) so a label change lands in one place.
//
// Pure presentation strings; not in @neuralaunch/constants because
// they are UI copy, not enum values that wire-protocol depends on.

import type {
  SkillKey,
  SkillTier,
  GapSeverity,
} from '@neuralaunch/constants';

/**
 * Display name for each of the 14 skills. Matches the founder-facing
 * vocabulary in the calibration agent's system prompt — keep the
 * pair in sync if you rename either side.
 */
export const SKILL_LABELS: Record<SkillKey, string> = {
  sales:                            'Sales',
  graphic_design:                   'Graphic Design',
  product_design:                   'Product Design',
  content_creative:                 'Content / Creative',
  marketing:                        'Marketing',
  public_speaking:                  'Public Speaking',
  technical_literacy:               'Technical Literacy',
  programming:                      'Programming',
  finance:                          'Finance',
  operational_efficiency:           'Operational Efficiency',
  leadership:                       'Leadership',
  ai_literacy:                      'AI Literacy',
  data_analysis:                    'Data Analysis',
  distribution_community_building:  'Distribution / Community',
};

/**
 * Tier display labels. The 'unknown' tier is "Set aside" in the
 * canvas (subdued lane) but "Unknown" when surfaced in read-only
 * contexts like ConstraintsList. We provide both — choose at the
 * call site.
 */
export const TIER_LABEL: Record<SkillTier, string> = {
  good:       'Good',
  acceptable: 'Acceptable',
  bad:        'Bad',
  unknown:    'Unknown',
};

export const TIER_LANE_LABEL: Record<SkillTier, string> = {
  good:       'Good',
  acceptable: 'Acceptable',
  bad:        'Bad',
  unknown:    'Set aside',
};

/**
 * Gap-severity labels for the ConstraintsList grouped sections.
 */
export const GAP_LABEL: Record<GapSeverity, string> = {
  blind_spot: 'Blind spots',
  structural: 'Structural constraints',
  mild:       'Mild constraints',
};
