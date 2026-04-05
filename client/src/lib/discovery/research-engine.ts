// src/lib/discovery/research-engine.ts
import 'server-only';
import { tavily } from '@tavily/core';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { AudienceType } from './constants';
import type { DiscoveryContext } from './context-schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResearchSummary {
  findings:    string; // Synthesised landscape intelligence for the synthesis prompt
  queriesRun:  string[]; // For observability
}

// ---------------------------------------------------------------------------
// Query builders — targeted per audience type and context
// ---------------------------------------------------------------------------

// Extracts the chosen direction from eliminateAlternatives output.
// The function always ends with: "The strongest fit is: [direction] because [reason]."
function extractChosenDirection(analysis: string): string | null {
  const match = analysis.match(/The strongest fit is:\s*([^.]+)/i);
  return match ? match[1].trim() : null;
}

function buildQueries(
  context:      DiscoveryContext,
  audienceType: AudienceType | null,
  summary?:     string,
  analysis?:    string,
): string[] {
  const goal       = context.primaryGoal?.value    as string | undefined;
  const situation  = context.situation?.value      as string | undefined;
  const market     = context.geographicMarket?.value as string | undefined;
  const technical  = context.technicalAbility?.value as string | undefined;

  const marketSuffix     = market ? ` in ${market}` : '';
  const chosenDirection  = analysis ? extractChosenDirection(analysis) : null;
  const queries: string[] = [];

  // Query 1 — targeted at the specific recommended direction when available
  if (chosenDirection) {
    queries.push(`What is working right now for people pursuing: ${chosenDirection}${marketSuffix}? Tactics, pricing, first steps, and real results 2024 2025`);
  } else if (summary) {
    const hook = summary.split('.').slice(0, 2).join('.').trim();
    queries.push(`${hook}. What specific tactics and paths are producing results for someone in this situation${marketSuffix} right now? 2024 2025`);
  } else if (goal) {
    queries.push(`What is working right now for people trying to ${goal}${marketSuffix}? Current tactics and results 2024 2025`);
  } else if (situation) {
    queries.push(`What startup paths are gaining traction for people who are ${situation}${marketSuffix} 2024 2025`);
  }

  // Query 2 — audience-specific landscape
  switch (audienceType) {
    case 'STUCK_FOUNDER':
      queries.push(`Why do early-stage founders stall and what actually helps them get unstuck${marketSuffix}? Recent examples 2024 2025`);
      break;
    case 'ESTABLISHED_OWNER':
      queries.push(`Growth strategies working for established small business owners${marketSuffix} right now 2024 2025`);
      break;
    case 'MID_JOURNEY_PROFESSIONAL':
      queries.push(`Side project and transition strategies for employed professionals${marketSuffix} gaining traction 2024 2025`);
      break;
    case 'LOST_GRADUATE':
      queries.push(`Career and startup paths with low barrier to entry gaining momentum for recent graduates${marketSuffix} 2024 2025`);
      break;
    case 'ASPIRING_BUILDER':
      queries.push(`First-time founders${technical ? ` with ${technical} skills` : ''} finding their first paying customers${marketSuffix} — what approaches are working 2024 2025`);
      break;
    default:
      queries.push(`What startup approaches are producing results for first-time builders${marketSuffix} 2024 2025`);
  }

  // Query 3 — pricing / monetisation benchmark if goal suggests it
  if (goal && /consult|freelan|service|productiz|agency/i.test(goal)) {
    queries.push(`Current pricing benchmarks for ${goal}${marketSuffix} — what are people actually charging and what converts 2024 2025`);
  } else if (goal) {
    queries.push(`Common mistakes and failure patterns when trying to ${goal}${marketSuffix} — what to avoid 2024 2025`);
  }

  return queries.slice(0, 3); // Cap at 3 — cost and latency control
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * runResearch
 *
 * Fires 2-3 targeted Tavily queries based on the interview context and
 * audience type. Returns a synthesised findings string ready to be injected
 * into the synthesis prompt. Fails gracefully — returns empty findings if
 * Tavily is unavailable or the key is not set.
 */
export async function runResearch(
  context:      DiscoveryContext,
  audienceType: AudienceType | null,
  sessionId:    string,
  summary?:     string,
  analysis?:    string,
): Promise<ResearchSummary> {
  const log = logger.child({ module: 'ResearchEngine', sessionId });

  if (!env.TAVILY_API_KEY) {
    log.warn('Research skipped — TAVILY_API_KEY is not set in this environment');
    return { findings: '', queriesRun: [] };
  }

  const client  = tavily({ apiKey: env.TAVILY_API_KEY });
  const queries = buildQueries(context, audienceType, summary, analysis);

  log.info('Research starting', { sessionId, queryCount: queries.length, queries });

  const results = await Promise.allSettled(
    queries.map(q =>
      client.search(q, {
        searchDepth: 'advanced',
        maxResults:  5,
        includeAnswer: true,
      }),
    ),
  );

  const sections: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      log.warn('Research query failed', { query: queries[i], reason: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      continue;
    }
    const { answer, results: hits } = result.value;
    const topSources = hits
      .slice(0, 3)
      .map(h => `- ${h.title}: ${h.content?.slice(0, 200) ?? ''}`)
      .join('\n');

    sections.push(
      `QUERY: ${queries[i]}\nSUMMARY: ${answer ?? 'No summary'}\nSOURCES:\n${topSources}`,
    );
  }

  const findings = sections.join('\n\n---\n\n');

  if (!findings) {
    log.warn('Research returned empty findings — all queries failed or returned no usable content', { queriesAttempted: queries.length });
  } else {
    log.info('Research complete', { queriesRun: sections.length, queriesAttempted: queries.length, findingsLength: findings.length });
  }

  return { findings, queriesRun: queries };
}
