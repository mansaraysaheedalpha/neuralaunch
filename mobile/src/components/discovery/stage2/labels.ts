// src/components/discovery/stage2/labels.ts
//
// Mobile mirror of client/src/components/ideation/labels.ts. Pure
// presentation copy for Stage 2 skill / tier / gap enums. Keep in
// lock-step with the web file — these are founder-facing strings
// that should not drift between platforms.

import type { SkillKey, SkillTier, GapSeverity } from '@/lib/ideation-types';

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

export const GAP_LABEL: Record<GapSeverity, string> = {
  blind_spot: 'Blind spots',
  structural: 'Structural constraints',
  mild:       'Mild constraints',
};

/** The 14 skills in canonical display order — matches SKILL_KEYS in
 *  packages/constants/src/ideation.ts. Used by the canvas to render
 *  rows in a stable, agreed-upon sequence. */
export const SKILL_ORDER: SkillKey[] = [
  'sales',
  'graphic_design',
  'product_design',
  'content_creative',
  'marketing',
  'public_speaking',
  'technical_literacy',
  'programming',
  'finance',
  'operational_efficiency',
  'leadership',
  'ai_literacy',
  'data_analysis',
  'distribution_community_building',
];

/** Tier order from worst-to-best for left-to-right rendering on the
 *  canvas tier strip. Matches the web canvas column ordering. */
export const TIER_ORDER: SkillTier[] = ['unknown', 'bad', 'acceptable', 'good'];
