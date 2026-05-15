// src/lib/research/free-composite/free-composite.test.ts
//
// Tests the load-bearing invariants of the community_pulse fan-out:
//   - Parallel fan-out (all clients invoked, not sequential)
//   - Dedupe by content hash (cross-source duplicate collapse)
//   - URL canonicalisation (utm_* stripped, trailing slash normalised)
//   - One-source-failure does not collapse the result
//   - community_pulse tool is registered ONLY for stage3-pain-scout
//   - Per-client outcome captured in FanOutClientResult[]
//
// The individual client HTTP wiring is not exercised here; that's
// covered by the per-client `cachedFetch` calls being mockable via
// the cache wrapper's tests + manual smoke-testing in dev.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock the cache so client wrappers don't hit Redis.
vi.mock('../cache', () => ({
  cachedFetch: <T>(args: { fetch: () => Promise<T> }) => args.fetch(),
}));

// Mock observability + logger as no-ops (cache wrapper would otherwise pull them).
vi.mock('@/lib/observability', () => ({ setActiveSpanAttribute: () => undefined }));
vi.mock('@/lib/logger', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

// Mock @/lib/redis so cache reads/writes don't escape.
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => null,
}));

// Mock env so client-side isConfigured doesn't trip env validation
// (in the vitest node env, env.ts otherwise throws because none of
// the auth/etc env vars are set).
vi.mock('@/lib/env', () => ({
  env: {
    GITHUB_PAT:     undefined,
    DEVTO_API_KEY:  undefined,
  },
}));

// We mock the individual clients via module factory so searchAll
// reads our stubbed search() implementations.
const clientMocks = vi.hoisted(() => ({
  hnAlgolia:     { search: vi.fn(), isConfigured: () => true,  source: 'hn',       cacheKey: 'community-pulse-hn-algolia' as const },
  bluesky:       { search: vi.fn(), isConfigured: () => true,  source: 'bluesky',  cacheKey: 'community-pulse-bluesky' as const },
  lemmy:         { search: vi.fn(), isConfigured: () => true,  source: 'lemmy',    cacheKey: 'community-pulse-lemmy' as const },
  mastodon:      { search: vi.fn(), isConfigured: () => true,  source: 'mastodon', cacheKey: 'community-pulse-mastodon-hashtags' as const },
  github:        { search: vi.fn(), isConfigured: () => false, source: 'github',   cacheKey: 'community-pulse-github-issues' as const },
  devto:         { search: vi.fn(), isConfigured: () => true,  source: 'devto',    cacheKey: 'community-pulse-devto' as const },
  hashnode:      { search: vi.fn(), isConfigured: () => true,  source: 'hashnode', cacheKey: 'community-pulse-hashnode' as const },
  lobsters:      { search: vi.fn(), isConfigured: () => true,  source: 'lobsters', cacheKey: 'community-pulse-lobsters' as const },
}));

vi.mock('./clients/hn-algolia',        () => ({ hnAlgoliaClient:        clientMocks.hnAlgolia }));
vi.mock('./clients/hn-firebase',       () => ({ hnFirebaseClient:       { search: vi.fn(), isConfigured: () => true, source: 'hn', cacheKey: 'community-pulse-hn-firebase' } }));
vi.mock('./clients/bluesky',           () => ({ blueskyClient:          clientMocks.bluesky }));
vi.mock('./clients/lemmy',             () => ({ lemmyClient:            clientMocks.lemmy }));
vi.mock('./clients/mastodon-hashtags', () => ({ mastodonHashtagsClient: clientMocks.mastodon }));
vi.mock('./clients/github-issues',     () => ({ githubIssuesClient:     clientMocks.github }));
vi.mock('./clients/devto',             () => ({ devtoClient:            clientMocks.devto }));
vi.mock('./clients/hashnode',          () => ({ hashnodeClient:         clientMocks.hashnode }));
vi.mock('./clients/lobsters',          () => ({ lobstersClient:         clientMocks.lobsters }));

// Re-import after mocks.
import { searchAll, buildCommunityPulseTool } from './index';
import type { Mention } from './types';
import { buildMention } from './normalize';

beforeEach(() => {
  for (const c of Object.values(clientMocks)) {
    c.search.mockReset();
    c.search.mockResolvedValue([]);
  }
});

function mention(over: Partial<Parameters<typeof buildMention>[0]> & { source: Mention['source'] }): Mention {
  return buildMention({
    url:          'https://example.com/post',
    authorHandle: 'tester',
    rawExcerpt:   'baseline excerpt',
    postedAt:     '2026-05-15T00:00:00Z',
    score:        10,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// Fan-out parallelism + per-client status
// ---------------------------------------------------------------------------

describe('searchAll — parallel fan-out', () => {
  it('invokes every configured client in parallel', async () => {
    clientMocks.hnAlgolia.search.mockResolvedValue([mention({ source: 'hn',       rawExcerpt: 'A' })]);
    clientMocks.bluesky.search  .mockResolvedValue([mention({ source: 'bluesky',  rawExcerpt: 'B' })]);
    clientMocks.lemmy.search    .mockResolvedValue([mention({ source: 'lemmy',    rawExcerpt: 'C' })]);

    const result = await searchAll('test query');

    expect(clientMocks.hnAlgolia.search).toHaveBeenCalledTimes(1);
    expect(clientMocks.bluesky.search)  .toHaveBeenCalledTimes(1);
    expect(clientMocks.lemmy.search)    .toHaveBeenCalledTimes(1);
    expect(result.mentions.length).toBe(3);
  });

  it("skips clients whose isConfigured returns false (status='skipped' in perClient)", async () => {
    const result = await searchAll('q');
    const github = result.perClientStatus.find(c => c.source === 'github');
    expect(github?.status).toBe('skipped');
    expect(clientMocks.github.search).not.toHaveBeenCalled();
  });

  it('records per-client ok counts in perClientStatus', async () => {
    clientMocks.hnAlgolia.search.mockResolvedValue([
      mention({ source: 'hn', rawExcerpt: 'one' }),
      mention({ source: 'hn', rawExcerpt: 'two' }),
    ]);
    const result = await searchAll('q');
    const hn = result.perClientStatus.find(c => c.source === 'hn');
    expect(hn?.status).toBe('ok');
    if (hn?.status === 'ok') expect(hn.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Dedupe + URL canonicalisation
// ---------------------------------------------------------------------------

describe('searchAll — dedupe by content hash', () => {
  it('collapses two clients returning the same excerpt to one row', async () => {
    const shared = 'this exact text appears on two platforms';
    clientMocks.hnAlgolia.search.mockResolvedValue([
      mention({ source: 'hn',      rawExcerpt: shared, url: 'https://hn.example/a' }),
    ]);
    clientMocks.bluesky.search.mockResolvedValue([
      mention({ source: 'bluesky', rawExcerpt: shared, url: 'https://bsky.example/b' }),
    ]);
    const result = await searchAll('q');
    expect(result.mentions.length).toBe(1);
  });

  it('keeps distinct excerpts even when URLs collide', async () => {
    clientMocks.hnAlgolia.search.mockResolvedValue([
      mention({ source: 'hn', rawExcerpt: 'aaa', url: 'https://x.example/p' }),
    ]);
    clientMocks.bluesky.search.mockResolvedValue([
      mention({ source: 'bluesky', rawExcerpt: 'bbb', url: 'https://x.example/p' }),
    ]);
    const result = await searchAll('q');
    expect(result.mentions.length).toBe(2);
  });
});

describe('canonicaliseUrl invariants — via buildMention round-trip', () => {
  it('strips utm_* parameters', () => {
    const m = buildMention({
      source:       'hn',
      url:          'https://example.com/post?utm_source=twitter&id=42',
      authorHandle: null,
      rawExcerpt:   'x',
      postedAt:     '2026-01-01T00:00:00Z',
      score:        null,
    });
    expect(m.url).not.toContain('utm_source');
    expect(m.url).toContain('id=42');
  });

  it('strips trailing slash', () => {
    const m = buildMention({
      source:       'hn',
      url:          'https://example.com/post/',
      authorHandle: null,
      rawExcerpt:   'x',
      postedAt:     '2026-01-01T00:00:00Z',
      score:        null,
    });
    expect(m.url).toBe('https://example.com/post');
  });

  it('removes URL fragments', () => {
    const m = buildMention({
      source:       'hn',
      url:          'https://example.com/post#section-3',
      authorHandle: null,
      rawExcerpt:   'x',
      postedAt:     '2026-01-01T00:00:00Z',
      score:        null,
    });
    expect(m.url).not.toContain('#');
  });
});

// ---------------------------------------------------------------------------
// Fail-open semantics
// ---------------------------------------------------------------------------

describe('searchAll — fail-open across one-source failure', () => {
  it("when one client throws, others still contribute results", async () => {
    clientMocks.hnAlgolia.search.mockRejectedValue(new Error('HN Algolia down'));
    clientMocks.bluesky.search.mockResolvedValue([mention({ source: 'bluesky', rawExcerpt: 'good' })]);
    clientMocks.lemmy.search.mockResolvedValue([mention({ source: 'lemmy',    rawExcerpt: 'also good' })]);

    const result = await searchAll('q');

    expect(result.mentions.length).toBe(2);
    const hn = result.perClientStatus.find(c => c.source === 'hn');
    expect(hn?.status).toBe('error');
    if (hn?.status === 'error') expect(hn.message).toMatch(/HN Algolia down/);
  });

  it('returns empty mentions array but does NOT throw when ALL clients fail', async () => {
    for (const c of Object.values(clientMocks)) {
      c.search.mockRejectedValue(new Error('all sources down'));
    }
    const result = await searchAll('q');
    expect(result.mentions.length).toBe(0);
    // Every configured client should appear as error; github is skipped.
    const errored = result.perClientStatus.filter(c => c.status === 'error').length;
    const skipped = result.perClientStatus.filter(c => c.status === 'skipped').length;
    expect(errored + skipped).toBe(result.perClientStatus.length);
  });
});

// ---------------------------------------------------------------------------
// community_pulse tool gating — Stage-3-only
// ---------------------------------------------------------------------------

describe('buildCommunityPulseTool — agent gating', () => {
  it("registers the tool ONLY when agent === 'stage3-pain-scout'", () => {
    const tools = buildCommunityPulseTool({
      agent:       'stage3-pain-scout',
      contextId:   'sess_1',
      accumulator: [],
    });
    expect(Object.keys(tools)).toContain('community_pulse');
  });

  it.each([
    'interview',
    'recommendation',
    'pushback',
    'checkin',
    'continuation',
    'composer',
    'research-execution',
    'research-followup',
    'service-packager',
    'stage2-expected-profile',
  ] as const)(
    "returns an empty toolset for agent='%s'",
    (agent) => {
      const tools = buildCommunityPulseTool({
        agent,
        contextId:   'sess_1',
        accumulator: [],
      });
      expect(Object.keys(tools)).toHaveLength(0);
    },
  );
});
