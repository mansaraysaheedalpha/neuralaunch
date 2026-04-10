// src/lib/discovery/research-engine.ts
import 'server-only';
import { tavily } from '@tavily/core';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { renderUserContent, sanitizeForPrompt } from '@/lib/validation/server-helpers';
import type { AudienceType } from './constants';
import type { DiscoveryContext } from './context-schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResearchSummary {
  findings:    string;   // Synthesised landscape intelligence for the synthesis prompt
  queriesRun:  string[]; // For observability
}

// ---------------------------------------------------------------------------
// Tuning knobs
// ---------------------------------------------------------------------------

const TAVILY_MAX_QUERY_CHARS   = 380;    // Tavily hard limit is 400
const RESEARCH_QUERY_TIMEOUT_MS = 30_000; // Per-query wall clock
const RESEARCH_MAX_ATTEMPTS    = 2;      // 1 retry on transient failure
const RESEARCH_RETRY_BACKOFF_MS = 500;   // Linear backoff between attempts
const MAX_FINDINGS_CHARS       = 4_000;  // Hard cap on what enters the synthesis prompt
const MAX_SOURCES_PER_QUERY    = 3;      // Tavily hits we include per query
const MAX_SOURCE_CONTENT_CHARS = 220;    // Per-hit snippet length
const MAX_ANSWER_CHARS         = 700;    // Per-query answer length
const SOURCES_PER_HIT_TITLE_CHARS = 180;

/**
 * Dynamic year hint — NEVER hardcode the year. When the server runs on any
 * date after a year rollover, queries should ask for "current" info, not
 * stale info pinned to a past year.
 */
function yearHint(): string {
  const now  = new Date();
  const year = now.getUTCFullYear();
  return `${year - 1} ${year}`;
}

// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------

/** Truncate a string to max chars, cutting at the last word boundary. */
function trunc(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max).replace(/\s+\S*$/, '').trim();
}

/** Build a query string and hard-cap it to stay under Tavily's limit. */
function q(...parts: string[]): string {
  return trunc(parts.join(''), TAVILY_MAX_QUERY_CHARS);
}

/**
 * Extract the chosen direction from eliminateAlternatives output. The
 * function is prompted to end with "The strongest fit is: X because Y."
 * but Sonnet occasionally drifts ("The clearest fit", "I recommend", etc.),
 * so we try multiple fallbacks and log when none match.
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

function buildQueries(
  context:      DiscoveryContext,
  audienceType: AudienceType | null,
  summary:      string | undefined,
  analysis:     string | undefined,
  log:          ReturnType<typeof logger.child>,
): string[] {
  const goal      = trunc((context.primaryGoal?.value    as string | undefined) ?? '', 60);
  const situation = trunc((context.situation?.value      as string | undefined) ?? '', 60);
  const market    = trunc((context.geographicMarket?.value as string | undefined) ?? '', 40);
  const technical = trunc((context.technicalAbility?.value as string | undefined) ?? '', 40);

  const yh              = yearHint();
  const marketSuffix    = market ? ` in ${market}` : '';
  const chosenDirection = analysis ? extractChosenDirection(analysis, log) : null;
  const queries: string[] = [];

  // Query 1 — chosen direction when available, else context-derived
  if (chosenDirection) {
    queries.push(q(`${chosenDirection}${marketSuffix} — what tactics, pricing, and first steps are working right now? ${yh}`));
  } else if (summary) {
    const hook = trunc(summary.split('.')[0] ?? summary, 80);
    queries.push(q(`${hook}${marketSuffix} — what specific tactics are producing results right now? ${yh}`));
  } else if (goal) {
    queries.push(q(`What is working right now for people trying to ${goal}${marketSuffix}? Tactics and results ${yh}`));
  } else if (situation) {
    queries.push(q(`Startup paths gaining traction for people who are ${situation}${marketSuffix} ${yh}`));
  }

  // Query 2 — audience-specific landscape
  switch (audienceType) {
    case 'STUCK_FOUNDER':
      queries.push(q(`Why do early-stage founders stall and what helps them get unstuck${marketSuffix}? ${yh}`));
      break;
    case 'ESTABLISHED_OWNER':
      queries.push(q(`Growth strategies working for established small business owners${marketSuffix} ${yh}`));
      break;
    case 'MID_JOURNEY_PROFESSIONAL':
      queries.push(q(`Side project and transition strategies for employed professionals${marketSuffix} ${yh}`));
      break;
    case 'LOST_GRADUATE':
      queries.push(q(`Low-barrier startup and career paths gaining momentum for recent graduates${marketSuffix} ${yh}`));
      break;
    case 'ASPIRING_BUILDER':
      queries.push(q(`First-time founders${technical ? ` with ${technical} skills` : ''} finding first paying customers${marketSuffix} ${yh}`));
      break;
    default:
      queries.push(q(`Startup approaches producing results for first-time builders${marketSuffix} ${yh}`));
  }

  // Query 3 — pricing or failure patterns
  if (goal && /consult|freelan|service|productiz|agency/i.test(goal)) {
    queries.push(q(`Pricing benchmarks for ${goal}${marketSuffix} — what are people charging and what converts ${yh}`));
  } else if (goal) {
    queries.push(q(`Common mistakes when trying to ${goal}${marketSuffix} — what to avoid ${yh}`));
  }

  // Query 4 — competitor-specific (EVALUATION FINDING)
  //
  // The interview often surfaces competitor names and specific tools
  // the founder has tried (e.g., "I tried Kippa but my clients hated
  // it", "QuickBooks was too expensive"). These names appear in:
  //   - whatTriedBefore (belief state field — array of attempts)
  //   - summary (Step 2 output — may quote competitor names)
  //   - analysis (Step 3 output — may reference alternatives)
  //
  // The original query builder ignored all of this and constructed
  // purely generic queries from goal/situation/market. A founder who
  // named 3 competitors during the interview would get research
  // that never mentioned any of them.
  //
  // Fix: scan available text for capitalized product/company names
  // and build a targeted competitor query. This is heuristic (not
  // NER) but catches the common case of "I tried [ProperNoun]."
  const competitorSources: string[] = [];
  const tried = context.whatTriedBefore?.value;
  if (Array.isArray(tried)) {
    competitorSources.push(...tried.map(t => String(t)));
  }
  if (summary)  competitorSources.push(summary);
  if (analysis) competitorSources.push(analysis);

  // Extract capitalized multi-word names that look like products/companies
  // (e.g., "Kippa", "QuickBooks", "Wave", "Google Sheets", "Prospa")
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const commonWords = new Set(['The', 'This', 'That', 'What', 'When', 'Where', 'How', 'Why', 'Who', 'If', 'But', 'And', 'For', 'Not', 'All', 'Can', 'Her', 'Was', 'One', 'Our', 'Out', 'Day', 'Had', 'Has', 'His', 'New', 'Now', 'Old', 'See', 'Way', 'May', 'Say', 'She', 'Two', 'Use', 'Boy', 'Did', 'Its', 'Let', 'Put', 'Top', 'Too', 'Any', 'First', 'Also', 'After', 'Before', 'Because', 'During', 'Between', 'Through', 'About', 'Could', 'Would', 'Should', 'Which', 'Their', 'These', 'Those', 'Other', 'Some', 'Every', 'Phase', 'Query', 'Summary', 'Sierra', 'Leone', 'Nigeria', 'Ghana', 'Lagos', 'Accra', 'Freetown']);
  const detectedNames = new Set<string>();
  for (const source of competitorSources) {
    let match: RegExpExecArray | null;
    while ((match = namePattern.exec(source)) !== null) {
      const name = match[1];
      if (name.length >= 3 && !commonWords.has(name)) {
        detectedNames.add(name);
      }
    }
  }

  if (detectedNames.size > 0) {
    const names = [...detectedNames].slice(0, 4).join(', ');
    queries.push(q(`${names}${marketSuffix} — pricing, traction, customer reviews, and how they compare ${yh}`));
    log.info('[Research] Competitor-specific query built', { names });
  }

  return queries.slice(0, 4); // Up from 3 → 4 when competitor names detected
}

// ---------------------------------------------------------------------------
// Transport helpers: timeout + retry
// ---------------------------------------------------------------------------

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function searchWithRetry(
  client:  ReturnType<typeof tavily>,
  query:   string,
  log:     ReturnType<typeof logger.child>,
  attempts = RESEARCH_MAX_ATTEMPTS,
) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await withTimeout(
        client.search(query, {
          // 'advanced' = 2 credits/query for better source retrieval.
          // At Tavily's free tier (1000 credits/month) with 3 queries per
          // session, that supports ~167 sessions/month — sufficient for
          // early-stage usage and the quality uplift is worth the cost.
          searchDepth:   'advanced',
          maxResults:    5,
          includeAnswer: true,
        }),
        RESEARCH_QUERY_TIMEOUT_MS,
        `Tavily query attempt ${i + 1}`,
      );
      if (i > 0) log.info('Tavily query succeeded on retry', { attempt: i + 1 });
      return result;
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Tavily query attempt failed', { attempt: i + 1, message });
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, RESEARCH_RETRY_BACKOFF_MS * (i + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Tavily query failed after retries');
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * runResearch
 *
 * Fires up to 3 targeted Tavily queries based on the interview context and
 * audience type. Returns a synthesised findings string ready to be injected
 * into the synthesis prompt.
 *
 * Safety posture:
 *   - Per-query 30s timeout
 *   - 1 retry on transient failure with linear backoff
 *   - Every external string is sanitised and delimiter-wrapped before
 *     landing in the synthesis prompt (prompt-injection mitigation)
 *   - Deduplicates sources across queries to save tokens
 *   - Hard-capped output length (MAX_FINDINGS_CHARS)
 *   - Fails open: if Tavily is unavailable, returns empty findings and the
 *     synthesis step proceeds without research
 */
export async function runResearch(
  context:      DiscoveryContext,
  audienceType: AudienceType | null,
  sessionId:    string,
  summary?:     string,
  analysis?:    string,
): Promise<ResearchSummary> {
  const log = logger.child({ module: 'ResearchEngine', sessionId });
  const startedAt = Date.now();

  if (!env.TAVILY_API_KEY) {
    log.warn('Research skipped — TAVILY_API_KEY is not set in this environment');
    return { findings: '', queriesRun: [] };
  }

  const client  = tavily({ apiKey: env.TAVILY_API_KEY });
  const queries = buildQueries(context, audienceType, summary, analysis, log);

  log.info('[Research] Starting', {
    sessionId,
    queryCount:   queries.length,
    queries,
    yearHint:     yearHint(),
    audienceType,
  });

  if (queries.length === 0) {
    log.warn('[Research] No queries built — context too thin');
    return { findings: '', queriesRun: [] };
  }

  const results = await Promise.allSettled(
    queries.map(query => searchWithRetry(client, query, log)),
  );

  const sections: string[] = [];
  const seenUrls  = new Set<string>();
  let successCount = 0;
  let failureCount = 0;
  let totalHitsUsed = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const query  = queries[i];

    if (result.status === 'rejected') {
      failureCount++;
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      log.warn('[Research] Query permanently failed', { queryIdx: i, query, reason });
      continue;
    }

    successCount++;
    const { answer, results: hits } = result.value;

    // Deduplicate sources across queries by URL (falls back to title)
    const freshHits = hits
      .filter(h => {
        const key = (h.url ?? h.title ?? '').trim();
        if (!key) return false;
        if (seenUrls.has(key)) return false;
        seenUrls.add(key);
        return true;
      })
      .slice(0, MAX_SOURCES_PER_QUERY);

    totalHitsUsed += freshHits.length;

    const topSources = freshHits
      .map(h => {
        const title   = sanitizeForPrompt(h.title ?? '', SOURCES_PER_HIT_TITLE_CHARS);
        const content = sanitizeForPrompt(h.content ?? '', MAX_SOURCE_CONTENT_CHARS);
        return `- ${title}: ${content}`;
      })
      .join('\n');

    const safeQuery   = sanitizeForPrompt(query, 400);
    const safeAnswer  = renderUserContent(answer ?? 'No summary', MAX_ANSWER_CHARS);

    sections.push(
      `QUERY: ${safeQuery}\nSUMMARY: ${safeAnswer}\nSOURCES:\n${topSources || '(no fresh sources after dedupe)'}`,
    );

    log.info('[Research] Query success', {
      queryIdx:     i,
      query:        safeQuery,
      hitsReturned: hits.length,
      hitsUsed:     freshHits.length,
      answerChars:  (answer ?? '').length,
    });
  }

  const joined = sections.join('\n\n---\n\n');
  const findings = joined.length > MAX_FINDINGS_CHARS
    ? joined.slice(0, MAX_FINDINGS_CHARS) + '\n\n[truncated]'
    : joined;

  const elapsedMs = Date.now() - startedAt;

  if (!findings) {
    log.warn('[Research] Empty findings — all queries failed or returned no usable content', {
      queriesAttempted: queries.length,
      failureCount,
      elapsedMs,
    });
  } else {
    log.info('[Research] Complete', {
      sessionId,
      queriesAttempted: queries.length,
      successCount,
      failureCount,
      totalHitsUsed,
      uniqueUrls:       seenUrls.size,
      findingsChars:    findings.length,
      truncated:        joined.length > MAX_FINDINGS_CHARS,
      elapsedMs,
    });
  }

  return { findings, queriesRun: queries };
}
