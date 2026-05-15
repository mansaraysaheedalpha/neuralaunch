// src/lib/research/free-composite/index.ts
//
// The community_pulse fan-out orchestrator + AI SDK tool export.
// Stage 3 ONLY — registration in tools.ts gates on agent ===
// 'stage3-pain-scout'.
//
// Per-query lifecycle:
//   1. Fan out to all 9 source clients in parallel (allSettled)
//   2. Per-client wall-clock timeout enforced inside each client
//   3. Failed clients log a warn + contribute [] to the merger
//   4. Cross-source dedupe by content hash
//   5. Re-rank by combined keyword + engagement relevance
//   6. Return FanOutResult with mentions[] + per-client status

import 'server-only';
import { z } from 'zod';
import { tool, type ToolSet } from 'ai';
import { logger } from '@/lib/logger';
import { dedupeByContentHash } from './normalize';
import { rankByRelevance } from './relevance';
import {
  type FanOutResult,
  type FanOutClientResult,
  type Mention,
  type MentionSource,
  type SourceClient,
} from './types';

import { hnAlgoliaClient }         from './clients/hn-algolia';
import { hnFirebaseClient }        from './clients/hn-firebase';
import { blueskyClient }           from './clients/bluesky';
import { lemmyClient }             from './clients/lemmy';
import { mastodonHashtagsClient }  from './clients/mastodon-hashtags';
import { githubIssuesClient }      from './clients/github-issues';
import { devtoClient }             from './clients/devto';
import { hashnodeClient }          from './clients/hashnode';
import { lobstersClient }          from './clients/lobsters';

import type { ResearchAgent, ResearchLogEntry } from '../types';

// ---------------------------------------------------------------------------
// Client registry
// ---------------------------------------------------------------------------

/**
 * Every client the orchestrator fans out to. HN Firebase is special-
 * cased — it's an ENRICHMENT path that consumes IDs rather than a
 * free-text query. For the agent-facing search tool we exclude it
 * here; the orchestrator can still call it explicitly for ID-based
 * enrichment if needed.
 */
const SEARCH_CLIENTS: ReadonlyArray<SourceClient> = [
  hnAlgoliaClient,
  blueskyClient,
  lemmyClient,
  mastodonHashtagsClient,
  githubIssuesClient,
  devtoClient,
  hashnodeClient,
  lobstersClient,
];

// Re-exported for tests that want to assert the registry's shape
// without importing every client individually.
export const __testRegistry = {
  SEARCH_CLIENTS,
  hnFirebaseClient,
};

const FAN_OUT_TIMEOUT_MS = 15_000;
const MAX_MENTIONS_OUT   = 30;

// ---------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------

interface SearchAllOptions {
  bypassCache?: boolean;
  /** Cap on the number of mentions returned post-rank. Default 30. */
  maxMentions?: number;
}

/**
 * Run the community_pulse fan-out. Catches per-client failures so
 * one source going down doesn't collapse the result. Logs warnings
 * for skipped and errored clients; the FanOutClientResult[] in the
 * return value carries the per-client outcome for the audit trail.
 */
export async function searchAll(query: string, options: SearchAllOptions = {}): Promise<FanOutResult> {
  const log = logger.child({ module: 'FreeComposite/Orchestrator' });
  const { bypassCache = false, maxMentions = MAX_MENTIONS_OUT } = options;

  const start = Date.now();

  const settled = await Promise.allSettled(
    SEARCH_CLIENTS.map(async (client) => {
      if (!client.isConfigured()) {
        return { client, kind: 'skipped' as const, reason: 'isConfigured returned false' };
      }
      const mentions = await raceTimeout(
        client.search(query, { bypassCache }),
        FAN_OUT_TIMEOUT_MS,
        `${client.source} fan-out timeout`,
      );
      return { client, kind: 'ok' as const, mentions };
    }),
  );

  const merged: Mention[] = [];
  const perClient: FanOutClientResult[] = [];

  for (let i = 0; i < settled.length; i++) {
    const client = SEARCH_CLIENTS[i];
    const r      = settled[i];
    if (r.status === 'rejected') {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
      log.warn('[FreeComposite] Client failed', { source: client.source, message });
      perClient.push({ source: client.source, status: 'error', message });
      continue;
    }
    if (r.value.kind === 'skipped') {
      perClient.push({ source: client.source, status: 'skipped', reason: r.value.reason });
      continue;
    }
    const ms = r.value.mentions;
    perClient.push({ source: client.source, status: 'ok', count: ms.length });
    merged.push(...ms);
  }

  const deduped = dedupeByContentHash(merged);
  const ranked  = rankByRelevance(query, deduped).slice(0, maxMentions);

  log.debug('[FreeComposite] Fan-out complete', {
    query,
    perClient,
    rawCount:     merged.length,
    dedupedCount: deduped.length,
    rankedCount:  ranked.length,
    elapsedMs:    Date.now() - start,
  });

  return { mentions: ranked, perClientStatus: perClient };
}

function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} (>${ms}ms)`)), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Rendered prompt block — how the agent reads the result
// ---------------------------------------------------------------------------

const RENDER_MAX_MENTIONS = 12;

function renderMentionLine(m: Mention, idx: number): string {
  const handle = m.authorHandle ? `@${m.authorHandle}` : 'anon';
  const sourceLabel: Record<MentionSource, string> = {
    hn:        'Hacker News',
    bluesky:   'Bluesky',
    lemmy:     'Lemmy (programming.dev)',
    mastodon:  'Mastodon',
    github:    'GitHub Issues',
    devto:     'Dev.to',
    hashnode:  'Hashnode',
    lobsters:  'Lobste.rs',
  };
  const scoreSuffix = m.score !== null ? ` · ${m.score}` : '';
  return `${idx + 1}. [${sourceLabel[m.source]} · ${handle}${scoreSuffix}] ${m.excerpt}\n   ${m.url}`;
}

/**
 * Convert a FanOutResult into the prompt-ready string the agent
 * consumes via the tool's return value. Truncates to the top-12
 * mentions; the agent rarely needs more than that for one query
 * and the rest are still in the audit log.
 */
export function renderFanOutResult(query: string, result: FanOutResult): string {
  const total       = result.mentions.length;
  const skipped     = result.perClientStatus.filter(c => c.status === 'skipped').map(c => c.source);
  const errored     = result.perClientStatus.filter(c => c.status === 'error')  .map(c => c.source);
  const okSources   = result.perClientStatus.filter(c => c.status === 'ok')     .map(c => c.source);

  const header = [
    `community_pulse: ${total} mention${total === 1 ? '' : 's'} found across ${okSources.length} source${okSources.length === 1 ? '' : 's'}.`,
    skipped.length > 0  ? `Skipped (not configured): ${skipped.join(', ')}.` : '',
    errored.length > 0  ? `Failed this run: ${errored.join(', ')}.`           : '',
  ].filter(s => s.length > 0).join(' ');

  if (total === 0) {
    return `${header}\n\nNo mentions for query: "${query}". The founder should consider adding human-scouted pain points or refining the query.`;
  }

  const top   = result.mentions.slice(0, RENDER_MAX_MENTIONS);
  const lines = top.map((m, i) => renderMentionLine(m, i));
  return `${header}\n\n${lines.join('\n\n')}`;
}

// ---------------------------------------------------------------------------
// community_pulse — AI SDK tool registration
// ---------------------------------------------------------------------------

export interface BuildCommunityPulseToolInput {
  /** The agent invoking the tool — gated to 'stage3-pain-scout'. */
  agent:       ResearchAgent;
  /** Correlation id for structured logs. */
  contextId:   string;
  /**
   * Per-call accumulator the route mutates. Successful pulses push
   * one ResearchLogEntry — failures are still returned to the agent
   * as a structured string but NOT persisted (mirrors the Exa /
   * Tavily tool semantics).
   */
  accumulator: ResearchLogEntry[];
}

/**
 * Build the community_pulse tool for the Stage 3 Pain Scout. Returns
 * an empty ToolSet for every other agent — caller composes this with
 * the existing exa_search + tavily_search tools via spread.
 */
export function buildCommunityPulseTool(input: BuildCommunityPulseToolInput): ToolSet {
  if (input.agent !== 'stage3-pain-scout') {
    // Hard gate — Stage 1 / Stage 2 / other agents NEVER see this tool.
    return {};
  }

  const log = logger.child({
    module:    'CommunityPulseTool',
    agent:     input.agent,
    contextId: input.contextId,
  });

  return {
    community_pulse: tool({
      description:
        'COMMUNITY PULSE. Fan-out search across nine free public sources — Hacker News, Bluesky, Lemmy (programming.dev), Mastodon hashtag timelines, GitHub Issues, Dev.to, Hashnode, and Lobste.rs — to surface real founder / developer complaints, frustrations, and feature requests. Use this to find pain signals the founder might not have considered. Does NOT cover Reddit or Stack Exchange (legal / ToS constraints) — for those, the founder must self-monitor and add via the Human Scout layer. Each call is one research step counted against your per-turn step budget.',
      inputSchema: z.object({
        query: z.string().describe(
          'A natural-language query describing the kind of pain you are looking for. Be specific. Examples: "small business owners struggling with WhatsApp customer support", "indie developers complaining about Vercel pricing", "designers frustrated with Figma collaboration".',
        ),
      }),
      execute: async ({ query }) => {
        log.info('[Research] community_pulse invoked', { query });
        try {
          const result        = await searchAll(query);
          const resultSummary = renderFanOutResult(query, result);
          input.accumulator.push({
            agent:         input.agent,
            tool:          'community_pulse',
            query,
            resultSummary,
            timestamp:     new Date().toISOString(),
          });
          return resultSummary;
        } catch (err) {
          // The orchestrator already fails open per-client — a thrown
          // error here means ALL nine clients failed simultaneously
          // OR a programming error in the orchestrator itself. Either
          // way, surface as an opaque "tool failed" string the agent
          // can handle gracefully.
          log.warn('[Research] community_pulse failed catastrophically', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          return `community_pulse failed for query: "${query}". Every source either skipped or errored. The founder should rely on the Human Scout layer for this query.`;
        }
      },
    }),
  };
}

// Re-exports so callers (tools.ts) and tests can reach these without
// drilling into internal paths.
export type { FanOutResult, FanOutClientResult, Mention, MentionSource } from './types';
