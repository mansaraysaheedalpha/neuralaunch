// src/lib/archetype-status.ts
//
// The six archetypes shown on /discovery, with their visual + routing
// rules. Extracted into a single typed module so:
//   - the picker (PR 04) renders the ledger from one source
//   - the keyboard 1-6 shortcut routes by archetype index, not by
//     hard-coded strings
//   - when PR 09 ships the Stuck bespoke pipeline, flipping path II
//     from "next" to "built" is a one-line edit here — not a hunt
//     through the picker JSX
//
// Pure module, no React, no DOM. Safe in any environment.

import type { AudienceType } from '@/lib/discovery';

/**
 * Visual + routing status per archetype.
 *
 *   built  — the bespoke pipeline exists in production. Accent badge,
 *            accent stage segments, accent vertical-bar treatment.
 *   next   — a bespoke pipeline is in design but not yet shipped. The
 *            archetype currently routes via the standard discovery
 *            pipeline (or its placeholder). Accent badge with an open
 *            circle, ghost-pattern stage segments.
 *   legacy — routes via the shared standard discovery pipeline. No
 *            bespoke treatment is planned. Muted badge, accent first
 *            three stage segments + hairline rest.
 */
export type ArchetypeStatus = 'built' | 'next' | 'legacy';

/**
 * Path archetypes presented on /discovery. The string union is the
 * surface the picker, keyboard shortcut, and router all key off — so
 * 'stuck' here matches the destination slug, 'no_idea' matches the
 * existing discovery audience scenario, and the four standard slugs
 * are the literal query-param values used on /discovery/standard.
 */
export type ArchetypeId =
  | 'no_idea'
  | 'stuck'
  | 'builder'
  | 'owner'
  | 'early-career'
  | 'mid-career';

export interface PathStages {
  /**
   * How to paint each segment in the small five-or-six-segment bar
   * under the path name. Length determines the number of segments.
   */
  segments: Array<'acc' | 'ghost' | 'hairline'>;
  /** Mono-caps estimate line shown below the segments. */
  est: string;
}

export interface ArchetypeDefinition {
  /** Stable id used by the router + keyboard shortcut. */
  id: ArchetypeId;
  /** Roman numeral shown in the leftmost ledger column. */
  roman: string;
  /** Numeric index — 1-based, used by the keyboard 1-6 shortcut. */
  index: 1 | 2 | 3 | 4 | 5 | 6;
  /** H3 text. Supports `<em>` accent at render time. */
  headline: string;
  /** The italic-serif segment in the headline (rendered as <em>). */
  headlineEmphasis: string;
  /** "For — ..." subtitle in the second column. */
  who: string;
  /** Italic-serif lead-fold sentence at the start of the "what" body. */
  leadFold: string;
  /** Body prose continuation after the lead-fold sentence. */
  body: string;
  /** Path label e.g. "Path · Ideation (Stages 0–5)". */
  pathLabel: string;
  /** Step-flow under the label, e.g. "Mindset → Outcome → ...". */
  pathFlow: string;
  /** Segment pattern + est line. */
  stages: PathStages;
  /** Visual + routing status. */
  status: ArchetypeStatus;
  /** Status badge copy. */
  badgeLabel: string;
  /** Pre-resolved destination path for the picker to navigate to. */
  destination: string;
  /**
   * AudienceType preseed for standard-pipeline archetypes. Undefined
   * for 'no_idea' (own pipeline, no audience preseed) and 'stuck'
   * (currently routes via standard pipeline with STUCK_FOUNDER preseed
   * until PR 09's bespoke pipeline ships).
   */
  audienceType?: AudienceType;
}

/**
 * The ordered list of archetypes shown in the ledger. Order is
 * load-bearing — the keyboard 1-6 shortcut indexes directly into this
 * array. Do not reorder without updating the keyboard map (which
 * derives from `index`).
 */
export const ARCHETYPES: readonly ArchetypeDefinition[] = [
  {
    id:               'no_idea',
    roman:            'I.',
    index:            1,
    headline:         "I don't have an idea",
    headlineEmphasis: 'yet.',
    who:              'For — the lost graduate · the curious mid-career',
    leadFold:         'A six-stage ideation pipeline.',
    body:
      ' We start from your life — the outcome you’d accept, the skills you have, '
      + 'the pains you’ve noticed — and surface five ranked opportunities. You '
      + 'pick one. We synthesise.',
    pathLabel: 'Path · Ideation (Stages 0–5)',
    pathFlow:  'Mindset → Outcome → Requirements → Pains → Evaluations → Synthesis',
    stages: {
      segments: ['acc', 'acc', 'acc', 'acc', 'acc', 'acc'],
      est:      'Est. 45–90 min · resumable',
    },
    status:      'built',
    badgeLabel:  '● Built',
    destination: '/discovery/no-idea/mindset',
  },
  {
    id:               'stuck',
    roman:            'II.',
    index:            2,
    headline:         "I've started something and I'm",
    headlineEmphasis: 'stuck.',
    who:              'For — the founder mid-stall',
    leadFold:         'A diagnostic interview, not a discovery one.',
    body:
      ' We start from the stall — what worked, what stopped working, the pattern '
      + 'that got you here. The recommendation is structurally different from the '
      + 'one that stalled you.',
    pathLabel: 'Path · Diagnostic (next)',
    pathFlow:  'Stall map → Pattern break → Constrained alt',
    stages: {
      segments: ['ghost', 'ghost', 'ghost', 'ghost', 'ghost'],
      est:      'Currently routed via standard pipeline',
    },
    status:       'next',
    badgeLabel:   '○ In design',
    destination:  '/discovery/stuck',
    audienceType: 'STUCK_FOUNDER',
  },
  {
    id:               'builder',
    roman:            'III.',
    index:            3,
    headline:         'I have an idea I want to',
    headlineEmphasis: 'build.',
    who:              'For — the aspiring builder',
    leadFold:         '',
    body:
      'You know what you want to make. We help you decide whether you should — and '
      + 'if so, how to validate before writing code. Phase One ends with a real '
      + 'conversation, not a line of code.',
    pathLabel: 'Path · Standard',
    pathFlow:  'Discovery interview → Recommendation → Roadmap → Validation',
    stages: {
      segments: ['acc', 'acc', 'acc', 'hairline', 'hairline'],
      est:      '~12 questions · ~15 min',
    },
    status:       'legacy',
    badgeLabel:   'Standard path',
    destination:  '/discovery/standard?archetype=builder',
    audienceType: 'ASPIRING_BUILDER',
  },
  {
    id:               'owner',
    roman:            'IV.',
    index:            4,
    headline:         'I run a business and want to',
    headlineEmphasis: 'grow it.',
    who:              'For — the established small-business owner',
    leadFold:         '',
    body:
      'You have real customers, real revenue, and a sense that something isn’t '
      + 'working. We build on what you already have rather than starting from zero.',
    pathLabel: 'Path · Standard',
    pathFlow:  'Discovery interview → Recommendation → Roadmap',
    stages: {
      segments: ['acc', 'acc', 'acc', 'hairline', 'hairline'],
      est:      '~12 questions · ~15 min',
    },
    status:       'legacy',
    badgeLabel:   'Standard path',
    destination:  '/discovery/standard?archetype=owner',
    audienceType: 'ESTABLISHED_OWNER',
  },
  {
    id:               'early-career',
    roman:            'V.',
    index:            5,
    headline:         "I'm early in my career, figuring out my",
    headlineEmphasis: 'direction.',
    who:              'For — the recent graduate, the searcher',
    leadFold:         '',
    body:
      'You’re weighing whether to build something instead of, or alongside, '
      + 'a traditional job. We size what’s realistic given the hours you '
      + 'actually have.',
    pathLabel: 'Path · Standard',
    pathFlow:  'Discovery interview → Recommendation → Roadmap',
    stages: {
      segments: ['acc', 'acc', 'acc', 'hairline', 'hairline'],
      est:      '~12 questions · ~15 min',
    },
    status:       'legacy',
    badgeLabel:   'Standard path',
    destination:  '/discovery/standard?archetype=early-career',
    audienceType: 'LOST_GRADUATE',
  },
  {
    id:               'mid-career',
    roman:            'VI.',
    index:            6,
    headline:         "I'm mid-career, thinking about a",
    headlineEmphasis: 'change.',
    who:              'For — the considered, the established',
    leadFold:         '',
    body:
      'You’re considering leaving employment to build something. We evaluate '
      + 'the trade-offs honestly — and won’t romanticise the jump.',
    pathLabel: 'Path · Standard',
    pathFlow:  'Discovery interview → Recommendation → Roadmap',
    stages: {
      segments: ['acc', 'acc', 'acc', 'hairline', 'hairline'],
      est:      '~12 questions · ~15 min',
    },
    status:       'legacy',
    badgeLabel:   'Standard path',
    destination:  '/discovery/standard?archetype=mid-career',
    audienceType: 'MID_JOURNEY_PROFESSIONAL',
  },
] as const;

/**
 * Lookup by id. Useful for /discovery/standard?archetype=... to
 * resolve the AudienceType preseed without rebuilding the picker's
 * mapping table.
 */
export function findArchetype(id: string): ArchetypeDefinition | null {
  return ARCHETYPES.find((a) => a.id === id) ?? null;
}

/**
 * Type guard used by the /discovery/standard query-param reader.
 */
export function isStandardArchetypeId(value: string): value is ArchetypeId {
  const arc = findArchetype(value);
  return arc !== null && arc.status === 'legacy';
}
