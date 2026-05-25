// src/app/api/discovery/sessions/[sessionId]/stage5/__tests__/status-route.test.ts
//
// Tests for GET /api/discovery/sessions/[sessionId]/stage5/status.
// Mirrors the synthesize-route test discipline — every IO dependency
// is mocked so we exercise the response shape + the stage projection
// (6-state worker stage → 4-state public status).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// vi.hoisted so the mock-state variables + HttpErrorStub class live
// above the auto-hoisted vi.mock factories. Without it, the factory's
// references would TDZ-fail at module load.
const { prismaFindFirst, rateLimit, requireUser, enforceOrigin, HttpErrorStub } = vi.hoisted(() => {
  class HttpErrorStubInner extends Error {
    public status: number;
    constructor(status: number, message: string) { super(message); this.status = status; this.name = 'HttpError'; }
  }
  return {
    prismaFindFirst: vi.fn(),
    rateLimit:       vi.fn(),
    requireUser:     vi.fn(),
    enforceOrigin:   vi.fn(),
    HttpErrorStub:   HttpErrorStubInner,
  };
});

vi.mock('@/lib/prisma', () => ({
  default: { ideationStage5Job: { findFirst: prismaFindFirst } },
}));
vi.mock('@/lib/logger', () => ({
  logger: { child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) },
}));
// Fully stub server-helpers — importActual drags next-auth which has
// an ESM-resolution defect under the vitest loader. We re-implement
// the surface the route + the test touches. HttpErrorStub is created
// inside the vi.hoisted block above so it's initialised before the
// auto-hoisted vi.mock factory runs.
vi.mock('@/lib/validation/server-helpers', () => ({
  enforceSameOrigin: enforceOrigin,
  requireUserId:     requireUser,
  rateLimitByUser:   rateLimit,
  HttpError:         HttpErrorStub,
  httpErrorToResponse: (err: unknown) => {
    if (err instanceof HttpErrorStub) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  },
  RATE_LIMITS: { API_READ: { maxRequests: 120, windowSeconds: 60 } },
}));

import { GET } from '../status/route';
import { HttpError } from '@/lib/validation/server-helpers';
// HttpError above resolves to HttpErrorStub via the mock, which is the
// same constructor the route's catch path uses — so throwing one from
// a stubbed dependency does land on the response shape we assert.

function makeReq(): Request {
  return new Request('https://example.test/api/discovery/sessions/sess_abc/stage5/status', {
    method: 'GET',
    headers: { 'sec-fetch-site': 'same-origin' },
  });
}
function makeParams() { return Promise.resolve({ sessionId: 'sess_abc' }); }

// Typed JSON read so the assertions don't trip ESLint's
// no-unsafe-assignment rule (Response.json's return type is Promise<any>).
async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  prismaFindFirst.mockReset();
  rateLimit.mockReset().mockResolvedValue(undefined);
  requireUser.mockReset().mockResolvedValue('user_1');
  enforceOrigin.mockReset();
});

describe('GET /stage5/status — security', () => {
  it('rejects when enforceSameOrigin throws', async () => {
    enforceOrigin.mockImplementation(() => { throw new HttpError(403, 'Cross-origin'); });
    const res = await GET(makeReq(), { params: makeParams() });
    expect(res.status).toBe(403);
  });

  it('rejects when requireUserId throws', async () => {
    requireUser.mockRejectedValueOnce(new HttpError(401, 'Unauthorised'));
    const res = await GET(makeReq(), { params: makeParams() });
    expect(res.status).toBe(401);
  });

  it('rejects when rate limit triggers', async () => {
    rateLimit.mockRejectedValueOnce(new HttpError(429, 'Too many requests'));
    const res = await GET(makeReq(), { params: makeParams() });
    expect(res.status).toBe(429);
  });
});

describe('GET /stage5/status — ownership', () => {
  it('404s when no job exists for the session (or owned by another user)', async () => {
    prismaFindFirst.mockResolvedValueOnce(null);
    const res = await GET(makeReq(), { params: makeParams() });
    expect(res.status).toBe(404);
  });
});

describe('GET /stage5/status — projection of stage → public status', () => {
  it('projects queued → queued + surfaces the raw worker stage', async () => {
    prismaFindFirst.mockResolvedValueOnce({
      id: 'job_1', stage: 'queued', errorMessage: null, recommendationId: null,
    });
    const res = await GET(makeReq(), { params: makeParams() });
    const body = await readBody(res);
    expect(body).toEqual({ jobId: 'job_1', status: 'queued', stage: 'queued' });
  });

  it.each(['loading_inputs', 'synthesizing', 'persisting'])(
    'projects %s → running + surfaces the worker stage',
    async (stage) => {
      prismaFindFirst.mockResolvedValueOnce({
        id: 'job_1', stage, errorMessage: null, recommendationId: null,
      });
      const res = await GET(makeReq(), { params: makeParams() });
      const body = await readBody(res);
      expect(body).toEqual({ jobId: 'job_1', status: 'running', stage });
    },
  );

  it('projects succeeded → succeeded + carries recommendationId', async () => {
    prismaFindFirst.mockResolvedValueOnce({
      id: 'job_1', stage: 'succeeded', errorMessage: null, recommendationId: 'rec_42',
    });
    const res = await GET(makeReq(), { params: makeParams() });
    const body = await readBody(res);
    expect(body).toEqual({ jobId: 'job_1', status: 'succeeded', stage: 'succeeded', recommendationId: 'rec_42' });
  });

  it('projects failed → failed + carries error message', async () => {
    prismaFindFirst.mockResolvedValueOnce({
      id: 'job_1', stage: 'failed', errorMessage: 'Anthropic overloaded', recommendationId: null,
    });
    const res = await GET(makeReq(), { params: makeParams() });
    const body = await readBody(res);
    expect(body).toEqual({ jobId: 'job_1', status: 'failed', stage: 'failed', error: 'Anthropic overloaded' });
  });

  it('omits error when failed but no errorMessage stored', async () => {
    prismaFindFirst.mockResolvedValueOnce({
      id: 'job_1', stage: 'failed', errorMessage: null, recommendationId: null,
    });
    const res = await GET(makeReq(), { params: makeParams() });
    const body = await readBody(res);
    expect(body).toEqual({ jobId: 'job_1', status: 'failed', stage: 'failed' });
  });

  it('sets Cache-Control: no-store (polled endpoint, never cached)', async () => {
    prismaFindFirst.mockResolvedValueOnce({
      id: 'job_1', stage: 'queued', errorMessage: null, recommendationId: null,
    });
    const res = await GET(makeReq(), { params: makeParams() });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
