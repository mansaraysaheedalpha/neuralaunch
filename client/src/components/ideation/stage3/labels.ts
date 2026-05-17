// src/components/ideation/stage3/labels.ts
//
// Founder-facing labels for the Stage 3 UI. Centralised here so the
// strings can be reviewed in one pass without grepping across files.

import type { FounderContextTag, PainPointStatus } from '@neuralaunch/constants';

export const FOUNDER_CONTEXT_LABELS: Record<FounderContextTag, string> = {
  own_life:               'My own life',
  close_relationship:     'Someone close to me',
  industry_observation:   'Industry I observe',
  existing_solution_gap:  'Gap in an existing tool',
};

export const PAIN_POINT_STATUS_LABELS: Record<PainPointStatus, string> = {
  pending_rating:       'Not rated',
  rated:                'Rated',
  rejected_by_founder:  'Rejected',
};

export const SCORE_AXIS_LABELS: Record<'intensity' | 'frequency' | 'nicheSpecificity', string> = {
  intensity:        'Intensity',
  frequency:        'Frequency',
  nicheSpecificity: 'Niche specificity',
};

export const SCORE_AXIS_HINTS: Record<'intensity' | 'frequency' | 'nicheSpecificity', string> = {
  intensity:        'How much does it hurt the people who have it?',
  frequency:        'How often do they hit it?',
  nicheSpecificity: 'How narrow is the group that feels it?',
};
