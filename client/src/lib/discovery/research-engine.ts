// src/lib/discovery/research-engine.ts
//
// Synthesis-agent caller for the shared research tool. The heavy
// lifting (Tavily transport, prompt rendering, dedup, fail-open
// posture) lives in lib/research/. This file is responsible for
// ONE thing only: building the synthesis-specific query set from
// the founder's belief state and the prior synthesis steps' output.
//
// Phase 2 of the research-tool spec will expand the query set to
// 4-8 multi-axis queries (competitive landscape, tools, pricing
// benchmarks, regulatory). Today this file preserves the existing
// 1-4 query pattern so back-compat is intact while the foundation
// rolls out.

import 'server-only';
import { logger } from '@/lib/logger';
import {
  q,
  trunc,
  yearHint,
  extractCapitalisedNames,
  runResearchQueries,
  type DetectedQuery,
  type ResearchFindings,
} from '@/lib/research';
import type { AudienceType } from './constants';
import type { DiscoveryContext } from './context-schema';

/**
 * Re-export the unified ResearchFindings shape under the legacy
 * name. The synthesis Inngest function and any other importer of
 * `ResearchSummary` from this file gets the same structural type.
 */
export type ResearchSummary = ResearchFindings;

// ---------------------------------------------------------------------------
// Synthesis-specific query builder
// ---------------------------------------------------------------------------

/**
 * Extract the chosen direction from the eliminateAlternatives output.
 * The function is prompted to end with "The strongest fit is: X
 * because Y" — but Sonnet occasionally drifts ("The clearest fit",
 * "I recommend", etc.), so we try multiple fallbacks.
 */
function extractChosenDirection(analysis: string, log: ReturnType<typeof logger.child>): string | null {
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

/**
 * Build the synthesis query set. Returns DetectedQuery objects
 * shaped for the shared research tool. This is the only file that
 * still owns the synthesis-specific phrasing logic.
 *
 * The function is also exported so the Phase 2 expansion can wrap
 * it without re-implementing the per-axis builders from scratch.
 */
export function buildSynthesisQueries(
  context:      DiscoveryContext,
  audienceType: AudienceType | null,
  summary:      string | undefined,
  analysis:     string | undefined,
  log:          ReturnType<typeof logger.child>,
): DetectedQuery[] {
  const goal      = trunc((context.primaryGoal?.value      as string | undefined) ?? '', 60);
  const situation = trunc((context.situation?.value        as string | undefined) ?? '', 60);
  const market    = trunc((context.geographicMarket?.value as string | undefined) ?? '', 40);
  const technical = trunc((context.technicalAbility?.value as string | undefined) ?? '', 40);

  const yh              = yearHint();
  const marketSuffix    = market ? ` in ${market}` : '';
  const chosenDirection = analysis ? extractChosenDirection(analysis, log) : null;
  const queries: DetectedQuery[] = [];

  // Query 1 — chosen direction when available, else context-derived
  if (chosenDirection) {
    queries.push({
      query:     q(`${chosenDirection}${marketSuffix} — what tactics, pricing, and first steps are working right now? ${yh}`),
      reasoning: 'chosen direction tactical landscape',
    });
  } else if (summary) {
    const hook = trunc(summary.split('.')[0] ?? summary, 80);
    queries.push({
      query:     q(`${hook}${marketSuffix} — what specific tactics are producing results right now? ${yh}`),
      reasoning: 'context-derived landscape (no chosen direction extracted)',
    });
  } else if (goal) {
    queries.push({
      query:     q(`What is working right now for people trying to ${goal}${marketSuffix}? Tactics and results ${yh}`),
      reasoning: 'goal-derived landscape (no summary)',
    });
  } else if (situation) {
    queries.push({
      query:     q(`Startup paths gaining traction for people who are ${situation}${marketSuffix} ${yh}`),
      reasoning: 'situation-derived landscape (no summary, no goal)',
    });
  }

  // Query 2 — audience-specific landscape
  switch (audienceType) {
    case 'STUCK_FOUNDER':
      queries.push({
        query:     q(`Why do early-stage founders stall and what helps them get unstuck${marketSuffix}? ${yh}`),
        reasoning: 'audience: stuck founder',
      });
      break;
    case 'ESTABLISHED_OWNER':
      queries.push({
        query:     q(`Growth strategies working for established small business owners${marketSuffix} ${yh}`),
        reasoning: 'audience: established owner',
      });
      break;
    case 'MID_JOURNEY_PROFESSIONAL':
      queries.push({
        query:     q(`Side project and transition strategies for employed professionals${marketSuffix} ${yh}`),
        reasoning: 'audience: mid-journey professional',
      });
      break;
    case 'LOST_GRADUATE':
      queries.push({
        query:     q(`Low-barrier startup and career paths gaining momentum for recent graduates${marketSuffix} ${yh}`),
        reasoning: 'audience: lost graduate',
      });
      break;
    case 'ASPIRING_BUILDER':
      queries.push({
        query:     q(`First-time founders${technical ? ` with ${technical} skills` : ''} finding first paying customers${marketSuffix} ${yh}`),
        reasoning: 'audience: aspiring builder',
      });
      break;
    default:
      queries.push({
        query:     q(`Startup approaches producing results for first-time builders${marketSuffix} ${yh}`),
        reasoning: 'audience: unspecified',
      });
  }

  // Query 3 — pricing or failure patterns
  if (goal && /consult|freelan|service|productiz|agency/i.test(goal)) {
    queries.push({
      query:     q(`Pricing benchmarks for ${goal}${marketSuffix} — what are people charging and what converts ${yh}`),
      reasoning: 'pricing benchmarks (service-shaped goal)',
    });
  } else if (goal) {
    queries.push({
      query:     q(`Common mistakes when trying to ${goal}${marketSuffix} — what to avoid ${yh}`),
      reasoning: 'failure-mode landscape',
    });
  }

  // Query 4 — competitor-specific (heuristic capitalised-name extraction
  // across whatTriedBefore + summary + analysis). Catches the common
  // case of "I tried [Kippa]" / "QuickBooks was too expensive".
  const competitorSources: string[] = [];
  const tried = context.whatTriedBefore?.value;
  if (Array.isArray(tried)) {
    competitorSources.push(...tried.map(t => String(t)));
  }
  if (summary)  competitorSources.push(summary);
  if (analysis) competitorSources.push(analysis);

  const detectedNames = extractCapitalisedNames(...competitorSources);
  if (detectedNames.size > 0) {
    const names = [...detectedNames].slice(0, 4).join(', ');
    queries.push({
      query:     q(`${names}${marketSuffix} — pricing, traction, customer reviews, and how they compare ${yh}`),
      reasoning: `competitor-specific: ${[...detectedNames].slice(0, 4).join(', ')}`,
    });
    log.info('[Research] Synthesis competitor query built', { names });
  }

  return queries.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * runResearch
 *
 * Synthesis-agent caller for the shared research tool. Builds the
 * synthesis-specific query set, hands it to runResearchQueries with
 * agent='recommendation' (the synthesis pipeline produces the
 * Recommendation row), and returns the prompt-ready findings + the
 * audit log entries the calling Inngest step persists to
 * Recommendation.researchLog.
 *
 * Back-compat shim for the existing call site in
 * src/inngest/functions/discovery-session-function.ts. The shape
 * matches the legacy ResearchSummary so no migration is needed at
 * the call site.
 */
export async function runResearch(
  context:      DiscoveryContext,
  audienceType: AudienceType | null,
  sessionId:    string,
  summary?:     string,
  analysis?:    string,
): Promise<ResearchSummary> {
  const log = logger.child({ module: 'ResearchEngine', sessionId });

  const queries = buildSynthesisQueries(context, audienceType, summary, analysis, log);
  if (queries.length === 0) {
    log.warn('[Research] No synthesis queries built — context too thin');
    return { findings: '', queriesRun: [], researchLog: [] };
  }

  return await runResearchQueries({
    agent:     'recommendation',
    queries,
    contextId: sessionId,
  });
}
