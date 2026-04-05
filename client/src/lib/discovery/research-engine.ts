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

const TAVILY_MAX_QUERY_CHARS = 380; // Tavily hard limit is 400 — leave margin

/** Truncate a string to max chars, cutting at the last word boundary. */
function trunc(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max).replace(/\s+\S*$/, '').trim();
}

/** Build a query string and hard-cap it to stay under Tavily's limit. */
function q(...parts: string[]): string {
  return trunc(parts.join(''), TAVILY_MAX_QUERY_CHARS);
}

// Extracts the chosen direction from eliminateAlternatives output.
// The function always ends with: "The strongest fit is: [direction] because [reason]."
function extractChosenDirection(analysis: string): string | null {
  const match = analysis.match(/The strongest fit is:\s*([^.]+)/i);
  return match ? trunc(match[1].trim(), 80) : null;
}

function buildQueries(
  context:      DiscoveryContext,
  audienceType: AudienceType | null,
  summary?:     string,
  analysis?:    string,
): string[] {
  const goal      = trunc((context.primaryGoal?.value    as string | undefined) ?? '', 60);
  const situation = trunc((context.situation?.value      as string | undefined) ?? '', 60);
  const market    = trunc((context.geographicMarket?.value as string | undefined) ?? '', 40);
  const technical = trunc((context.technicalAbility?.value as string | undefined) ?? '', 40);

  const marketSuffix    = market ? ` in ${market}` : '';
  const chosenDirection = analysis ? extractChosenDirection(analysis) : null;
  const queries: string[] = [];

  // Query 1 — targeted at the specific recommended direction when available
  if (chosenDirection) {
    queries.push(q(`${chosenDirection}${marketSuffix} — what tactics, pricing, and first steps are working right now? 2024 2025`));
  } else if (summary) {
    const hook = trunc(summary.split('.')[0] ?? summary, 80);
    queries.push(q(`${hook}${marketSuffix} — what specific tactics are producing results right now? 2024 2025`));
  } else if (goal) {
    queries.push(q(`What is working right now for people trying to ${goal}${marketSuffix}? Tactics and results 2024 2025`));
  } else if (situation) {
    queries.push(q(`Startup paths gaining traction for people who are ${situation}${marketSuffix} 2024 2025`));
  }

  // Query 2 — audience-specific landscape
  switch (audienceType) {
    case 'STUCK_FOUNDER':
      queries.push(q(`Why do early-stage founders stall and what helps them get unstuck${marketSuffix}? 2024 2025`));
      break;
    case 'ESTABLISHED_OWNER':
      queries.push(q(`Growth strategies working for established small business owners${marketSuffix} 2024 2025`));
      break;
    case 'MID_JOURNEY_PROFESSIONAL':
      queries.push(q(`Side project and transition strategies for employed professionals${marketSuffix} 2024 2025`));
      break;
    case 'LOST_GRADUATE':
      queries.push(q(`Low-barrier startup and career paths gaining momentum for recent graduates${marketSuffix} 2024 2025`));
      break;
    case 'ASPIRING_BUILDER':
      queries.push(q(`First-time founders${technical ? ` with ${technical} skills` : ''} finding first paying customers${marketSuffix} 2024 2025`));
      break;
    default:
      queries.push(q(`Startup approaches producing results for first-time builders${marketSuffix} 2024 2025`));
  }

  // Query 3 — pricing or failure patterns depending on goal type
  if (goal && /consult|freelan|service|productiz|agency/i.test(goal)) {
    queries.push(q(`Pricing benchmarks for ${goal}${marketSuffix} — what are people charging and what converts 2024 2025`));
  } else if (goal) {
    queries.push(q(`Common mistakes when trying to ${goal}${marketSuffix} — what to avoid 2024 2025`));
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
