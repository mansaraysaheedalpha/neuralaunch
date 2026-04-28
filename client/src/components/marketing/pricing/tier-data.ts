/**
 * Source of truth for the three tier marketing definitions on the
 * landing-page Pricing section. Holds display name, tagline, accent,
 * badge, the standard monthly/annual numbers used by the price block,
 * and the grouped feature sub-sections.
 *
 * The Paddle price ids that drive checkout still come from the parent
 * server component via the TierPricing interface — this file is purely
 * marketing copy. Keeping the two separate means a Paddle-side price
 * change does not require touching this file, and a marketing copy
 * change does not require touching billing code.
 *
 * Sub-section structure (vs flat bullet list) addresses the previous
 * "wall of bullets" problem: a reader can scan the sub-section labels
 * to compare tiers in seconds, then drill into bullets only for the
 * tier they care about.
 */
export type TierAccent = 'muted' | 'primary' | 'gold';

export interface TierFeatureGroup {
  /** Short label rendered as a small heading above the bullet list. */
  label: string;
  /** Optional one-line note rendered below the label, above the bullets. */
  note?: string;
  /** The bullets themselves — one short concrete capability per item. */
  items: string[];
}

export interface TierDefinition {
  /** Internal id used for keys and lookup. */
  id:       'free' | 'execute' | 'compound';
  /** Display name shown on the card. */
  name:     'Free' | 'Execute' | 'Compound';
  /** One-line under-name positioning copy. */
  tagline:  string;
  /** Standard monthly price in USD (before founding-rate overlay). */
  monthly:  number;
  /**
   * Standard annual price in USD. The "Save N%" badge is computed from
   * this and `monthly` — so changing either updates the badge live.
   */
  annual:   number;
  /** CTA label for the unauthenticated / not-yet-subscribed state. */
  cta:      string;
  /** Optional badge text (e.g. "Recommended", "Premium"). */
  badge?:   string;
  /** Visual accent applied to border, check icon, and CTA color. */
  accent:   TierAccent;
  /** Grouped feature sub-sections rendered in the body of the card. */
  groups:   TierFeatureGroup[];
}

export const TIERS: TierDefinition[] = [
  {
    id:      'free',
    name:    'Free',
    tagline: 'Your first honest answer',
    monthly: 0,
    annual:  0,
    cta:     'Start free',
    accent:  'muted',
    groups: [
      {
        label: 'Your first answer',
        items: [
          'Two discovery interviews',
          'One full recommendation with reasoning',
          'Alternatives rejected, with why',
          'Honest falsification — what would make this wrong',
          'Inline assumption flagging',
        ],
      },
    ],
  },
  {
    id:      'execute',
    name:    'Execute',
    tagline: 'From recommendation to revenue',
    monthly: 29,
    annual:  279,
    cta:     'Start with Execute',
    badge:   'Recommended',
    accent:  'primary',
    groups: [
      {
        label: 'Recommendation power',
        items: [
          'Push back up to 10 rounds',
          'Phased execution roadmap',
          'Inline assumption flagging',
        ],
      },
      {
        label: 'The toolkit',
        note:  'Monthly tool limits apply — see Fair Use below.',
        items: [
          'Conversation Coach',
          'Outreach Composer',
          'Research Tool',
          'Service Packager',
          'Validation Page',
        ],
      },
      {
        label: 'Stay in the work',
        items: [
          'Task check-ins + diagnostic chat',
          'Proactive nudges + push notifications',
          'Parking lot for adjacent ideas',
          'A second voice before you pause — three-mode reflection on why',
        ],
      },
      {
        label: 'Continue the journey',
        items: [
          'Continuation brief at cycle end',
          'Fork selection into the next cycle',
          'Transformation report — a written narrative of what happened, ready to publish',
        ],
      },
      {
        label: 'Capacity',
        items: [
          '1 active venture (up to 2 paused)',
        ],
      },
    ],
  },
  {
    id:      'compound',
    name:    'Compound',
    tagline: 'The system gets smarter',
    monthly: 49,
    annual:  470,
    cta:     'Start with Compound',
    badge:   'Premium',
    accent:  'gold',
    groups: [
      {
        label: 'Everything in Execute, plus',
        note:  'Built for founders running more than one bet at a time.',
        items: [],
      },
      {
        label: 'Deeper convergence',
        items: ['Push back up to 15 rounds (vs 10)'],
      },
      {
        label: 'Multiple ventures in parallel',
        items: [
          '3 active ventures, up to 4 paused',
          'Memory that learns across all your ventures',
        ],
      },
      {
        label: 'Speak instead of type',
        items: ['Voice mode in every text surface'],
      },
      {
        label: 'Tool capacity',
        note:  'Fair use details below.',
        items: ['3× the monthly tool quota of Execute'],
      },
    ],
  },
];
