// src/lib/research/cache.test.ts
//
// Unit tests for the research cache wrapper. The load-bearing
// invariants:
//   - Cache reads time out and FALL THROUGH to the live fetch
//   - Cache writes are fire-and-forget (a failed write must not
//     affect the user-facing response)
//   - bypassCache=true skips the read, still writes
//   - Redis-unavailable falls straight through to live fetch
//   - Keys are stable for identical inputs and don't collide on
//     reasonable distinct inputs (sha256 contract)
//
// Sentry span attributes (the telemetry shape) are asserted via the
// mocked setActiveSpanAttribute spy — the actual Sentry SDK isn't
// active in vitest, but the attribute values that would flow to it
// are what the dashboard reads from.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock Redis — getRedisClient returns either our stub or null. Tests
// toggle the stub between calls.
const redisStub = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
const redisVisibility = vi.hoisted(() => ({ available: true }));

vi.mock('@/lib/redis', () => ({
  getRedisClient: () => (redisVisibility.available ? redisStub : null),
}));

// Mock observability — capture every setActiveSpanAttribute call so
// tests can assert on the telemetry shape.
const setAttr = vi.hoisted(() => vi.fn());
vi.mock('@/lib/observability', () => ({
  setActiveSpanAttribute: setAttr,
}));

// Mock logger — silent in tests.
vi.mock('@/lib/logger', () => ({
  logger: {
    child: () => ({
      info:  vi.fn(),
      warn:  vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Re-import after mocks.
import { cachedFetch, __testInternals } from './cache';

beforeEach(() => {
  redisStub.get.mockReset();
  redisStub.set.mockReset();
  setAttr.mockReset();
  redisVisibility.available = true;
});

// ---------------------------------------------------------------------------
// Cache hit / miss
// ---------------------------------------------------------------------------

describe('cachedFetch — hit path', () => {
  it('returns cached data when Redis has an entry', async () => {
    redisStub.get.mockResolvedValue({ data: { hello: 'world' }, cachedAt: '2026-01-01T00:00:00Z' });
    const fetchFn = vi.fn().mockResolvedValue({ hello: 'live' });

    const result = await cachedFetch<{ hello: string }>({
      provider: 'tavily',
      queryKey: 'q1',
      fetch:    fetchFn,
    });

    expect(result).toEqual({ hello: 'world' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(redisStub.set).not.toHaveBeenCalled();
    expect(setAttr).toHaveBeenCalledWith('research.cache.result', 'hit');
  });

  it('emits the provider attribute on every call', async () => {
    redisStub.get.mockResolvedValue({ data: 'x', cachedAt: 'now' });
    await cachedFetch({
      provider: 'exa',
      queryKey: 'q',
      fetch:    () => Promise.resolve('x'),
    });
    expect(setAttr).toHaveBeenCalledWith('research.cache.provider', 'exa');
  });
});

describe('cachedFetch — miss path', () => {
  it('falls through to fetch and writes the result (fire-and-forget)', async () => {
    redisStub.get.mockResolvedValue(null);
    redisStub.set.mockResolvedValue('OK');
    const fetchFn = vi.fn().mockResolvedValue({ payload: 'live' });

    const result = await cachedFetch({
      provider: 'tavily',
      queryKey: 'q2',
      fetch:    fetchFn,
    });

    expect(result).toEqual({ payload: 'live' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(setAttr).toHaveBeenCalledWith('research.cache.result', 'miss');

    // Write happens asynchronously — await a microtask so the
    // fire-and-forget `.catch` chain settles before we assert.
    await new Promise(r => setTimeout(r, 0));
    expect(redisStub.set).toHaveBeenCalledTimes(1);
  });

  it('writes with the provider-default TTL when none is passed', async () => {
    redisStub.get.mockResolvedValue(null);
    redisStub.set.mockResolvedValue('OK');
    await cachedFetch({
      provider: 'community-pulse-bluesky',
      queryKey: 'q',
      fetch:    () => Promise.resolve('x'),
    });
    await new Promise(r => setTimeout(r, 0));
    const args = redisStub.set.mock.calls[0];
    expect(args[2]).toEqual({ ex: 10 * 60 });
  });

  it('respects an explicit ttlSeconds override', async () => {
    redisStub.get.mockResolvedValue(null);
    redisStub.set.mockResolvedValue('OK');
    await cachedFetch({
      provider:   'tavily',
      queryKey:   'q',
      ttlSeconds: 42,
      fetch:      () => Promise.resolve('x'),
    });
    await new Promise(r => setTimeout(r, 0));
    expect(redisStub.set.mock.calls[0][2]).toEqual({ ex: 42 });
  });
});

// ---------------------------------------------------------------------------
// bypassCache
// ---------------------------------------------------------------------------

describe('cachedFetch — bypassCache', () => {
  it('skips the read but still writes the result', async () => {
    redisStub.set.mockResolvedValue('OK');
    const fetchFn = vi.fn().mockResolvedValue('fresh');

    const result = await cachedFetch({
      provider:    'tavily',
      queryKey:    'q',
      bypassCache: true,
      fetch:       fetchFn,
    });

    expect(result).toBe('fresh');
    expect(redisStub.get).not.toHaveBeenCalled();
    expect(setAttr).toHaveBeenCalledWith('research.cache.result', 'bypass');

    await new Promise(r => setTimeout(r, 0));
    expect(redisStub.set).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Read timeout / error — fall through invariant
// ---------------------------------------------------------------------------

describe('cachedFetch — read failure fallthrough', () => {
  it('falls through to fetch when the GET times out (returns live result)', async () => {
    // Resolve never — forces the Promise.race to hit the internal
    // timeout. Use a Promise that resolves AFTER the timeout window.
    redisStub.get.mockImplementation(
      () => new Promise(r => setTimeout(() => r(null), __testInternals.READ_TIMEOUT_MS + 200)),
    );
    redisStub.set.mockResolvedValue('OK');
    const fetchFn = vi.fn().mockResolvedValue('live-after-timeout');

    const result = await cachedFetch({
      provider: 'tavily',
      queryKey: 'q',
      fetch:    fetchFn,
    });

    expect(result).toBe('live-after-timeout');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(setAttr).toHaveBeenCalledWith('research.cache.result', 'read_timeout');
  });

  it('falls through to fetch when the GET throws a non-timeout error', async () => {
    redisStub.get.mockRejectedValue(new Error('connection refused'));
    redisStub.set.mockResolvedValue('OK');
    const fetchFn = vi.fn().mockResolvedValue('live-after-error');

    const result = await cachedFetch({
      provider: 'tavily',
      queryKey: 'q',
      fetch:    fetchFn,
    });

    expect(result).toBe('live-after-error');
    expect(setAttr).toHaveBeenCalledWith('research.cache.result', 'read_error');
  });
});

// ---------------------------------------------------------------------------
// Redis unavailable
// ---------------------------------------------------------------------------

describe('cachedFetch — Redis unavailable', () => {
  it('falls straight through to fetch when getRedisClient returns null', async () => {
    redisVisibility.available = false;
    const fetchFn = vi.fn().mockResolvedValue('no-cache-result');

    const result = await cachedFetch({
      provider: 'tavily',
      queryKey: 'q',
      fetch:    fetchFn,
    });

    expect(result).toBe('no-cache-result');
    expect(setAttr).toHaveBeenCalledWith('research.cache.result', 'unavailable');
    expect(redisStub.get).not.toHaveBeenCalled();
    expect(redisStub.set).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Write failure — fire-and-forget contract
// ---------------------------------------------------------------------------

describe('cachedFetch — write failure non-fatal', () => {
  it('returns the live fetch result even when the cache write rejects', async () => {
    redisStub.get.mockResolvedValue(null);
    redisStub.set.mockRejectedValue(new Error('redis OOM'));
    const fetchFn = vi.fn().mockResolvedValue('still-returned');

    const result = await cachedFetch({
      provider: 'tavily',
      queryKey: 'q',
      fetch:    fetchFn,
    });

    expect(result).toBe('still-returned');
    // Let the fire-and-forget rejection's `.catch` run.
    await new Promise(r => setTimeout(r, 0));
  });
});

// ---------------------------------------------------------------------------
// Key stability + collision freedom
// ---------------------------------------------------------------------------

describe('buildKey — stability + collision invariants', () => {
  const { buildKey } = __testInternals;

  it('is deterministic for the same (provider, queryKey)', () => {
    expect(buildKey('tavily', 'AI productivity tools'))
      .toBe(buildKey('tavily', 'AI productivity tools'));
  });

  it('produces different keys across providers for the same queryKey', () => {
    expect(buildKey('tavily', 'q'))
      .not.toBe(buildKey('exa', 'q'));
  });

  it('produces different keys for different queryKeys on the same provider', () => {
    expect(buildKey('tavily', 'apples'))
      .not.toBe(buildKey('tavily', 'oranges'));
  });

  it('cannot collide with the discovery session-store key prefix', () => {
    // discovery session keys are `discovery:session:<id>`; research
    // keys are `research:<provider>:<hash>`. Mechanical guarantee
    // since the prefix literally differs — but pin it as a test so
    // a future rename of either prefix fails this assertion loudly.
    const key = buildKey('tavily', 'q');
    expect(key.startsWith('research:')).toBe(true);
    expect(key.startsWith('discovery:')).toBe(false);
  });

  it('uses a 64-char sha256 hex suffix', () => {
    const key = buildKey('tavily', 'anything');
    const suffix = key.split(':').pop()!;
    expect(suffix).toMatch(/^[a-f0-9]{64}$/);
  });
});
