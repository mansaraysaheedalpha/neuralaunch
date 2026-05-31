// src/components/ideation/stage4/labels.ts
//
// Founder-facing labels for Stage 4 UI. Centralised so copy review
// can sweep them in one pass.

import type {
  OpportunityVerdict,
  OpportunityStatus,
  ValidationStrength,
} from '@neuralaunch/constants';
import type { LayerADimensionKey } from '@/lib/ideation/stage4-opportunities/constants';

export const VERDICT_LABELS: Record<OpportunityVerdict, string> = {
  pursue:              'Pursue',
  pursue_with_caveats: 'Pursue with caveats',
  drop:                'Drop',
  needs_more_evidence: 'Needs more evidence',
};

export const VERDICT_SHORT_LABELS: Record<OpportunityVerdict, string> = {
  pursue:              'Pursue',
  pursue_with_caveats: 'With caveats',
  drop:                'Drop',
  needs_more_evidence: 'More evidence',
};

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  awaiting_research:      'Awaiting research',
  awaiting_engagement:    'Awaiting engagement',
  engagement_in_progress: 'Engagement in progress',
  evaluated:              'Evaluated',
  rejected_by_founder:    'Dropped',
};

export const VALIDATION_STRENGTH_LABELS: Record<ValidationStrength, string> = {
  strong:        'Strong',
  mixed:         'Mixed',
  weak:          'Weak',
  contradictory: 'Contradictory',
};

export const LAYER_A_DIMENSION_LABELS: Record<LayerADimensionKey, string> = {
  marketReality:  'Market reality',
  customerAccess: 'Customer access',
  willPeoplePay:  'Will people pay',
  marketSize:     'Market size',
};

export const LAYER_A_DIMENSION_HINTS: Record<LayerADimensionKey, string> = {
  marketReality:  'Does this pain exist beyond your own bubble?',
  customerAccess: 'Can you reach the people who feel it?',
  willPeoplePay:  'Is anyone paying for related solutions today?',
  marketSize:     'Order-of-magnitude check on who hits this.',
};
