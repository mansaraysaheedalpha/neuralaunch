// src/lib/discovery/research-engine.ts
//
// Recommendation-agent caller for the shared research tool. The heavy
// lifting (Tavily transport, prompt rendering, dedup, fail-open
// posture) lives in lib/research/. The per-axis query builders live
// in lib/discovery/research-axes.ts. This file is the orchestrator
// that composes the axes into a single query set, applies the
// per-agent budget cap, and exposes the public runResearch entry
// point used by the discoverySessionFunction Inngest worker.
//
// The query set covers all four axes called out in
// docs/RESEARCH_TOOL_SPEC.md "Agent 2: Phase 2 Recommendation Agent":
//
//   1. Competitive landscape (chosen direction + audience + competitors)
//   2. Specific tools / vendors / platforms in the founder's market
//   3. Pricing benchmarks for the founder's industry + geography
//   4. Regulatory / compliance requirements when the goal touches a
//      regulated industry (fintech, health, education, food, etc.)

import 'server-only';
import { logger } from '@/lib/logger';
import {
  trunc,
  yearHint,
  runResearchQueries,
  RESEARCH_BUDGETS,
  type DetectedQuery,
  type ResearchFindings,
} from '@/lib/research';
import {
  extractChosenDirection,
  directionAxis,
  audienceAxis,
  pricingAxis,
  failureModeAxis,
  competitorAxis,
  toolsVendorsAxis,
  regulatoryAxis,
} from './research-axes';
import type { AudienceType } from './constants';
import type { DiscoveryContext } from './context-schema';

/**
 * Re-export the unified ResearchFindings shape under the legacy
 * name. The synthesis Inngest function and any other importer of
 * `ResearchSummary` from this file gets the same structural type.
 */
export type ResearchSummary = ResearchFindings;

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Build the multi-axis recommendation query set. Returns DetectedQuery
 * objects shaped for the shared research tool, capped at the per-agent
 * budget (RESEARCH_BUDGETS.recommendation.perInvocation = 8).
 *
 * Order matters — when the cap kicks in, the earlier axes survive
 * and the later ones drop. The order is roughly "highest expected
 * value first": direction → audience → competitor → pricing →
 * regulatory → vendors → failure-mode.
 */
export function buildRecommendationQueries(
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

  const candidates: Array<DetectedQuery | null> = [
    directionAxis({ goal, situation, marketSuffix, yh, summary, chosenDirection }),
    audienceAxis({ audienceType, marketSuffix, technical, yh }),
    competitorAxis({ context, summary, analysis, marketSuffix, yh, log }),
    pricingAxis({ goal, marketSuffix, yh }),
    regulatoryAxis({ context, marketSuffix, yh }),
    toolsVendorsAxis({ goal, marketSuffix, yh }),
    failureModeAxis({ goal, marketSuffix, yh }),
  ];

  const queries = candidates.filter((c): c is DetectedQuery => c !== null);
  return queries.slice(0, RESEARCH_BUDGETS.recommendation.perInvocation);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * runResearch
 *
 * Recommendation-agent caller for the shared research tool. Builds
 * the multi-axis recommendation query set, hands it to
 * runResearchQueries with agent='recommendation', and returns the
 * prompt-ready findings + the audit log entries the calling
 * Inngest step persists to Recommendation.researchLog.
 *
 * Back-compat: the function name and signature match the previous
 * pre-research-tool-extraction shape so the existing call site in
 * src/inngest/functions/discovery-session-function.ts works without
 * changes.
 */
export async function runResearch(
  context:      DiscoveryContext,
  audienceType: AudienceType | null,
  sessionId:    string,
  summary?:     string,
  analysis?:    string,
): Promise<ResearchSummary> {
  const log = logger.child({ module: 'ResearchEngine', sessionId });

  const queries = buildRecommendationQueries(context, audienceType, summary, analysis, log);
  if (queries.length === 0) {
    log.warn('[Research] No recommendation queries built — context too thin');
    return { findings: '', queriesRun: [], researchLog: [] };
  }

  log.info('[Research] Running recommendation batch', {
    queryCount: queries.length,
    axes:       queries.map(q => q.reasoning),
  });

  return await runResearchQueries({
    agent:     'recommendation',
    queries,
    contextId: sessionId,
  });
}
