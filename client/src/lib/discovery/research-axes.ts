// src/lib/discovery/research-axes.ts
//
// Per-axis query builders for the Recommendation Agent. The
// orchestrator in research-engine.ts composes these into the
// multi-axis query set described in
// docs/RESEARCH_TOOL_SPEC.md "Agent 2: Phase 2 Recommendation Agent".
//
// Each axis is a small pure function that returns 0 or 1 DetectedQuery.
// Splitting them into per-axis helpers (rather than one giant
// buildSynthesisQueries) is what makes the recommendation expansion
// from 1-4 to 4-8 queries reviewable instead of a wall of text.

import 'server-only';
import type { logger } from '@/lib/logger';
import { q, trunc, extractCapitalisedNames, type DetectedQuery } from '@/lib/research';
import type { AudienceType } from './constants';
import type { DiscoveryContext } from './context-schema';

/**
 * Extract the chosen direction from the eliminateAlternatives output.
 * The function is prompted to end with "The strongest fit is: X
 * because Y" — but Sonnet occasionally drifts ("The clearest fit",
 * "I recommend", etc.), so we try multiple fallbacks.
 */
export function extractChosenDirection(
  analysis: string,
  log:      ReturnType<typeof logger.child>,
): string | null {
  const patterns = [
    /The strongest fit is:\s*([^.]+)/i,
    /The strongest match is:\s*([^.]+)/i,
    /The clearest fit is:\s*([^.]+)/i,
    /I recommend:?\s*([^.]+)/i,
  ];
  for (const pattern of patterns) {
    const match = analysis.match(pattern);
    if (match) return trunc(match[1].trim(), 80);
  }
  log.warn('Could not extract chosen direction from analysis — Sonnet may have drifted from expected phrasing');
  return null;
}

// ---------------------------------------------------------------------------
// Axis 1a — direction landscape (always 1 query)
// ---------------------------------------------------------------------------

export function directionAxis(input: {
  goal:           string;
  situation:      string;
  marketSuffix:   string;
  yh:             string;
  summary?:       string;
  chosenDirection: string | null;
}): DetectedQuery | null {
  const { goal, situation, marketSuffix, yh, summary, chosenDirection } = input;

  if (chosenDirection) {
    return {
      query:     q(`${chosenDirection}${marketSuffix} — what tactics, pricing, and first steps are working right now? ${yh}`),
      reasoning: 'chosen direction tactical landscape',
    };
  }
  if (summary) {
    const hook = trunc(summary.split('.')[0] ?? summary, 80);
    return {
      query:     q(`${hook}${marketSuffix} — what specific tactics are producing results right now? ${yh}`),
      reasoning: 'context-derived landscape (no chosen direction extracted)',
    };
  }
  if (goal) {
    return {
      query:     q(`What is working right now for people trying to ${goal}${marketSuffix}? Tactics and results ${yh}`),
      reasoning: 'goal-derived landscape (no summary)',
    };
  }
  if (situation) {
    return {
      query:     q(`Startup paths gaining traction for people who are ${situation}${marketSuffix} ${yh}`),
      reasoning: 'situation-derived landscape (no summary, no goal)',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Axis 1b — audience-specific landscape (always 1 query)
// ---------------------------------------------------------------------------

export function audienceAxis(input: {
  audienceType: AudienceType | null;
  marketSuffix: string;
  technical:    string;
  yh:           string;
}): DetectedQuery {
  const { audienceType, marketSuffix, technical, yh } = input;
  switch (audienceType) {
    case 'STUCK_FOUNDER':
      return {
        query:     q(`Why do early-stage founders stall and what helps them get unstuck${marketSuffix}? ${yh}`),
        reasoning: 'audience: stuck founder',
      };
    case 'ESTABLISHED_OWNER':
      return {
        query:     q(`Growth strategies working for established small business owners${marketSuffix} ${yh}`),
        reasoning: 'audience: established owner',
      };
    case 'MID_JOURNEY_PROFESSIONAL':
      return {
        query:     q(`Side project and transition strategies for employed professionals${marketSuffix} ${yh}`),
        reasoning: 'audience: mid-journey professional',
      };
    case 'LOST_GRADUATE':
      return {
        query:     q(`Low-barrier startup and career paths gaining momentum for recent graduates${marketSuffix} ${yh}`),
        reasoning: 'audience: lost graduate',
      };
    case 'ASPIRING_BUILDER':
      return {
        query:     q(`First-time founders${technical ? ` with ${technical} skills` : ''} finding first paying customers${marketSuffix} ${yh}`),
        reasoning: 'audience: aspiring builder',
      };
    default:
      return {
        query:     q(`Startup approaches producing results for first-time builders${marketSuffix} ${yh}`),
        reasoning: 'audience: unspecified',
      };
  }
}

// ---------------------------------------------------------------------------
// Axis 2 — pricing benchmarks (1 query when goal exists)
// ---------------------------------------------------------------------------

export function pricingAxis(input: { goal: string; marketSuffix: string; yh: string }): DetectedQuery | null {
  const { goal, marketSuffix, yh } = input;
  if (!goal) return null;
  return {
    query:     q(`Pricing benchmarks for ${goal}${marketSuffix} — what are people charging and what converts ${yh}`),
    reasoning: 'pricing benchmarks',
  };
}

// ---------------------------------------------------------------------------
// Axis 3 — failure-mode landscape (1 query when goal exists)
// ---------------------------------------------------------------------------

export function failureModeAxis(input: { goal: string; marketSuffix: string; yh: string }): DetectedQuery | null {
  const { goal, marketSuffix, yh } = input;
  if (!goal) return null;
  return {
    query:     q(`Common mistakes when trying to ${goal}${marketSuffix} — what to avoid ${yh}`),
    reasoning: 'failure-mode landscape',
  };
}

// ---------------------------------------------------------------------------
// Axis 4 — competitor-specific (heuristic name extraction)
// ---------------------------------------------------------------------------

export function competitorAxis(input: {
  context:      DiscoveryContext;
  summary?:     string;
  analysis?:    string;
  marketSuffix: string;
  yh:           string;
  log:          ReturnType<typeof logger.child>;
}): DetectedQuery | null {
  const competitorSources: string[] = [];
  const tried = input.context.whatTriedBefore?.value;
  if (Array.isArray(tried)) {
    competitorSources.push(...tried.map(t => String(t)));
  }
  if (input.summary)  competitorSources.push(input.summary);
  if (input.analysis) competitorSources.push(input.analysis);

  const detectedNames = extractCapitalisedNames(...competitorSources);
  if (detectedNames.size === 0) return null;

  const names = [...detectedNames].slice(0, 4).join(', ');
  input.log.info('[Research] Recommendation competitor query built', { names });
  return {
    query:     q(`${names}${input.marketSuffix} — pricing, traction, customer reviews, and how they compare ${input.yh}`),
    reasoning: `competitor-specific: ${names}`,
  };
}

// ---------------------------------------------------------------------------
// Axis 5 — tools / vendors / platforms in the founder's market
// ---------------------------------------------------------------------------

export function toolsVendorsAxis(input: {
  goal:         string;
  marketSuffix: string;
  yh:           string;
}): DetectedQuery | null {
  const { goal, marketSuffix, yh } = input;
  if (!goal) return null;
  // Match goals that imply finding / using / contacting external actors
  if (!/build|launch|find|contact|sell|service|productiz|deliver|consult|agency|tool|platform|vendor|supplier/i.test(goal)) {
    return null;
  }
  return {
    query:     q(`Specific vendors, tools, and platforms used by people working on ${goal}${marketSuffix} — names and contact information ${yh}`),
    reasoning: 'tools / vendors / platforms specific to the founder\'s market',
  };
}

// ---------------------------------------------------------------------------
// Axis 6 — regulatory / compliance requirements
// ---------------------------------------------------------------------------

const REGULATED_INDUSTRY_PATTERNS = [
  /\b(fintech|payment|bank|lending|credit|insurance|kyc|aml)\b/i,
  /\b(health|medical|clinic|hospital|pharma|drug|telehealth|patient)\b/i,
  /\b(education|school|tutor|edtech|university|certification)\b/i,
  /\b(food|restaurant|catering|delivery|fmcg|safety)\b/i,
  /\b(legal|law|attorney|legaltech|compliance)\b/i,
  /\b(transport|logistics|ride|driver|fleet)\b/i,
];

export function regulatoryAxis(input: {
  context:      DiscoveryContext;
  marketSuffix: string;
  yh:           string;
}): DetectedQuery | null {
  const { context, marketSuffix, yh } = input;
  const corpus = [
    context.primaryGoal?.value,
    context.situation?.value,
    context.background?.value,
  ].filter((v): v is string => typeof v === 'string').join(' ');

  if (!corpus) return null;

  let matchedIndustry: string | null = null;
  for (const pattern of REGULATED_INDUSTRY_PATTERNS) {
    const m = corpus.match(pattern);
    if (m) { matchedIndustry = m[0]; break; }
  }
  if (!matchedIndustry) return null;

  return {
    query:     q(`${matchedIndustry} regulations, licensing, and compliance requirements${marketSuffix} — what founders need to know before launching ${yh}`),
    reasoning: `regulatory: ${matchedIndustry}`,
  };
}
