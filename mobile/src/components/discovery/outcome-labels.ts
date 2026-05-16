// src/components/discovery/outcome-labels.ts
//
// Founder-facing labels for the Stage 1 Outcome Document's four
// dimensions + the enum values each dimension can take. Mirrors the
// web's labelFor map in
// client/src/app/(app)/discovery/no-idea/[sessionId]/OutcomeDocumentView.tsx
// — when product copy moves, update both platforms.
//
// Extracted from OutcomeDocumentView during the self-review refactor
// so the view file stays focused on layout and the label tables are
// reusable from future surfaces (e.g. an OutcomeSummaryRow on the
// venture-list screen).

export type EditableDim = 'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference';

export const DIM_LABELS: Record<EditableDim, string> = {
  timeHorizon:         'Time horizon',
  financialGoal:       'Financial goal',
  riskTolerance:       'Risk tolerance',
  lifestylePreference: 'Lifestyle preference',
};

const VALUE_LABELS: Record<string, string> = {
  // timeHorizon
  '<6mo':              'Under 6 months',
  '6-18mo':            '6-18 months',
  '18mo-3yr':          '18 months to 3 years',
  '3yr+':              '3 years or more',
  'open':              'Open / no fixed horizon',
  // financialGoal.shape
  'side_income':       'Side income',
  'full_replacement':  'Full salary replacement',
  'modest_growth':     'Modest growth',
  'wealth_creation':   'Wealth creation',
  'venture_scale':     'Venture scale',
  // riskTolerance
  'minimal':           'Minimal',
  'moderate':          'Moderate',
  'high':              'High',
  'all_in':            'All in',
  // lifestylePreference
  'side_hustle':        'Side hustle',
  'full_time_founder':  'Full-time founder',
  'lifestyle_business': 'Lifestyle business',
  'fundable_startup':   'Fundable startup',
  'contract_freelance': 'Contract / freelance',
};

export function labelFor(value: string): string {
  return VALUE_LABELS[value] ?? value;
}
