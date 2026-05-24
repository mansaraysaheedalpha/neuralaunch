// src/app/api/discovery/sessions/[sessionId]/stage5/__tests__/synthesize-route.test.ts
//
// Tests for POST /api/discovery/sessions/[sessionId]/stage5/synthesize.
// Mocks every IO dependency (Prisma, Inngest, auth, rate limit) so the
// tests exercise the route's orchestration logic in isolation:
//   - CSRF rejection
//   - auth rejection
//   - ownership rejection (session findFirst returns nothing)
//   - rate-limit triggers
//   - 409 on bad stage state (Stage 4 not committed / Stage 5 wrong status)
//   - 202 happy path + payload shape
//   - idempotent re-POST returns the existing jobId without re-enqueuing

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// ── IO dependencies ──────────────────────────────────────────────────
// vi.hoisted lifts these alongside the auto-hoisted vi.mock factories
// so the factory references resolve to initialised vi.fn() instances.
const {
  prismaFindMany, prismaDelete, inngestSend, createJob, findOpenJob,
  captureTrace, rateLimit, requireUser, enforceOrigin, HttpErrorStub,
} = vi.hoisted(() => {
  class HttpErrorStubInner extends Error {
    public status: number;
    constructor(status: number, message: string) { super(message); this.status = status; this.name = 'HttpError'; }
  }
  return {
    prismaFindMany: vi.fn(),
    prismaDelete:   vi.fn(),
    inngestSend:    vi.fn(),
    createJob:      vi.fn(),
    findOpenJob:    vi.fn(),
    captureTrace:   vi.fn(() => ({})),
    rateLimit:      vi.fn(),
    requireUser:    vi.fn(),
    enforceOrigin:  vi.fn(),
    HttpErrorStub:  HttpErrorStubInner,
  };
});

vi.mock('@/lib/prisma', () => ({
  default: {
    ideationStageRun: { findMany: prismaFindMany },
    ideationStage5Job: { delete: prismaDelete },
  },
}));
vi.mock('@/inngest/client', () => ({ inngest: { send: inngestSend } }));
vi.mock('@/lib/ideation/stage5-handoff/job', () => ({
  createStage5Job:    createJob,
  findOpenStage5Job:  findOpenJob,
}));
vi.mock('@/lib/observability', () => ({
  captureTraceHeaders: captureTrace,
  withToolUiSpan: (_o: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) },
}));
// Fully stub server-helpers — importActual drags next-auth which has
// an ESM-resolution defect under the vitest loader. HttpErrorStub is
// created inside the vi.hoisted block above so it is initialised
// before the auto-hoisted vi.mock factory runs.
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
  RATE_LIMITS: { AI_GENERATION: { maxRequests: 5, windowSeconds: 60 } },
}));

import { POST } from '../synthesize/route';
import { HttpError } from '@/lib/validation/server-helpers';

// ── Helpers ──────────────────────────────────────────────────────────
function makeReq(): Request {
  return new Request('https://example.test/api/discovery/sessions/sess_abc/stage5/synthesize', {
    method: 'POST',
    headers: { 'sec-fetch-site': 'same-origin' },
  });
}
function makeParams() { return Promise.resolve({ sessionId: 'sess_abc' }); }

// Typed JSON read — Response.json returns Promise<any>; wrapping it
// keeps ESLint's no-unsafe-assignment rule happy on each callsite.
async function readBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  prismaFindMany.mockReset();
  prismaDelete.mockReset();
  inngestSend.mockReset();
  createJob.mockReset();
  findOpenJob.mockReset();
  captureTrace.mockReset().mockReturnValue({});
  rateLimit.mockReset().mockResolvedValue(undefined);
  requireUser.mockReset().mockResolvedValue('user_1');
  enforceOrigin.mockReset();

  // Default happy path: stage 4 committed + stage 5 authoring, no
  // open job, createJob returns a fresh id, inngest.send resolves.
  prismaFindMany.mockResolvedValue([
    { id: 'sr_4', stageNumber: 4, status: 'committed' },
    { id: 'sr_5', stageNumber: 5, status: 'authoring' },
  ]);
  findOpenJob.mockResolvedValue(null);
  createJob.mockResolvedValue({ id: 'job_new' });
  inngestSend.mockResolvedValue(undefined);
});

describe('POST /stage5/synthesize — security', () => {
  it('rejects when enforceSameOrigin throws (CSRF)', async () => {
    enforceOrigin.mockImplementation(() => { throw new HttpError(403, 'Cross-origin'); });
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(403);
  });

  it('rejects when requireUserId throws (auth)', async () => {
    requireUser.mockRejectedValueOnce(new HttpError(401, 'Unauthorised'));
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(401);
  });

  it('rejects when rate limit triggers', async () => {
    rateLimit.mockRejectedValueOnce(new HttpError(429, 'Too many requests'));
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(429);
  });
});

describe('POST /stage5/synthesize — ownership', () => {
  it('404s when no stage runs exist for the session (or the session is not owned)', async () => {
    prismaFindMany.mockResolvedValueOnce([]);
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(404);
    expect(inngestSend).not.toHaveBeenCalled();
  });
});

describe('POST /stage5/synthesize — stage-state pre-conditions', () => {
  it('409s when Stage 4 is not committed', async () => {
    prismaFindMany.mockResolvedValueOnce([
      { id: 'sr_4', stageNumber: 4, status: 'output_ready' },
      { id: 'sr_5', stageNumber: 5, status: 'authoring' },
    ]);
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(409);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it('409s when Stage 5 row is missing', async () => {
    prismaFindMany.mockResolvedValueOnce([
      { id: 'sr_4', stageNumber: 4, status: 'committed' },
    ]);
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(409);
  });

  it('409s when Stage 5 is already output_ready', async () => {
    prismaFindMany.mockResolvedValueOnce([
      { id: 'sr_4', stageNumber: 4, status: 'committed' },
      { id: 'sr_5', stageNumber: 5, status: 'output_ready' },
    ]);
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(409);
  });
});

describe('POST /stage5/synthesize — happy path', () => {
  it('returns 202 with { jobId, sessionId } and fires the Inngest event', async () => {
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(202);
    const body = await readBody(res);
    expect(body).toEqual({ jobId: 'job_new', sessionId: 'sess_abc' });

    expect(createJob).toHaveBeenCalledWith({ userId: 'user_1', sessionId: 'sess_abc' });
    expect(inngestSend).toHaveBeenCalledTimes(1);
    const event = inngestSend.mock.calls[0][0] as { name: string; data: Record<string, unknown> };
    expect(event.name).toBe('ideation/stage5-synthesize.requested');
    expect(event.data).toMatchObject({
      jobId:      'job_new',
      userId:     'user_1',
      sessionId:  'sess_abc',
      stageRunId: 'sr_5',
    });
  });

  it('cleans up the orphan job row on inngest.send failure and re-throws', async () => {
    inngestSend.mockRejectedValueOnce(new Error('inngest down'));
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(500);
    expect(prismaDelete).toHaveBeenCalledWith({ where: { id: 'job_new' } });
  });
});

describe('POST /stage5/synthesize — idempotency', () => {
  it('returns the existing jobId without re-enqueuing when an open job exists', async () => {
    findOpenJob.mockResolvedValueOnce({ id: 'job_existing' });
    const res = await POST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(202);
    const body = await readBody(res);
    expect(body).toEqual({ jobId: 'job_existing', sessionId: 'sess_abc' });

    expect(createJob).not.toHaveBeenCalled();
    expect(inngestSend).not.toHaveBeenCalled();
  });
});
