// src/lib/validation/server-helpers.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { auth }          from '@/auth';
import prisma            from '@/lib/prisma';
import { env }           from '@/lib/env';
import {
  checkRateLimit,
  getClientIp,
  getRequestIdentifier,
  RATE_LIMITS,
} from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Typed errors — make the route flow linear by throwing HttpError and
// catching once at the top of each handler.
// ---------------------------------------------------------------------------

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function httpErrorToResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Never leak internal error messages to the client (CLAUDE.md security rule).
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ---------------------------------------------------------------------------
// Authentication + ownership guards
// ---------------------------------------------------------------------------

/**
 * Require a signed-in session and return the userId.
 * Throws HttpError(401) otherwise.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new HttpError(401, 'Unauthorised');
  }
  return session.user.id;
}

/**
 * Fetch a ValidationPage the caller is authorised to see.
 *
 * Uses findFirst with a composite (id, userId) filter — the established
 * pattern in this repo and the only guarantee that Prisma enforces the
 * ownership check at query time.
 */
export async function requirePageOwner<TSelect extends Record<string, unknown>>(
  pageId: string,
  userId: string,
  select: TSelect,
): Promise<Record<string, unknown>> {
  const page = await prisma.validationPage.findFirst({
    where:  { id: pageId, userId },
    // The generic select cannot be passed through to Prisma's typed select
    // without excessive contortions — runtime is safe because we scope by
    // userId in the where clause. Callers assert the returned shape.
    select: select as never,
  }) as Record<string, unknown> | null;

  if (!page) {
    throw new HttpError(404, 'Not found');
  }
  return page;
}

/**
 * Fetch a Recommendation the caller owns. See requirePageOwner for rationale.
 */
export async function requireRecommendationOwner<TSelect extends Record<string, unknown>>(
  recommendationId: string,
  userId: string,
  select: TSelect,
): Promise<Record<string, unknown>> {
  const rec = await prisma.recommendation.findFirst({
    where:  { id: recommendationId, userId },
    select: select as never,
  }) as Record<string, unknown> | null;

  if (!rec) {
    throw new HttpError(404, 'Not found');
  }
  return rec;
}

// ---------------------------------------------------------------------------
// CSRF — Origin header check for state-changing requests
// ---------------------------------------------------------------------------

/**
 * Reject cross-origin state-changing requests using two complementary signals:
 *
 *   1. Sec-Fetch-Site (preferred). Sent by all modern browsers, unforgeable
 *      from JavaScript. We require 'same-origin' or 'none' (none = direct
 *      navigation, fine for state changes from typed URLs but not for fetch
 *      from another tab — accepted because the user is the originator).
 *
 *   2. Origin header (fallback). Older browsers or non-browser clients that
 *      do not set Sec-Fetch-Site fall through to the host-name check
 *      against the configured app URL.
 *
 * Server-to-server requests (e.g. health checks, internal cron) without
 * either header are allowed through; they cannot be initiated by a
 * malicious page in a victim's browser.
 */
export function enforceSameOrigin(request: Request): void {
  // Preferred: Sec-Fetch-Site is unforgeable from JS and sent by every
  // modern browser on every fetch including DELETE.
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) {
    if (fetchSite === 'same-origin' || fetchSite === 'none') return;
    // Anything else (cross-site, same-site) is rejected. same-site
    // includes subdomains we don't intend to authorise here.
    throw new HttpError(403, 'Cross-origin request rejected');
  }

  // Fallback: legacy Origin header check.
  const origin = request.headers.get('origin');
  if (!origin) return; // no headers at all => non-browser request, allowed

  const expected = env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? '';
  if (!expected) return; // no configured origin => cannot enforce (dev fallback)

  try {
    const originHost   = new URL(origin).host;
    const expectedHost = new URL(expected).host;
    if (originHost !== expectedHost) {
      throw new HttpError(403, 'Cross-origin request rejected');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Invalid origin header');
  }
}

// ---------------------------------------------------------------------------
// Rate limiting convenience wrappers
// ---------------------------------------------------------------------------

export async function rateLimitByUser(
  userId: string,
  key: string,
  config: { maxRequests: number; windowSeconds: number },
): Promise<void> {
  const result = await checkRateLimit({
    identifier: `${key}:${getRequestIdentifier(userId)}`,
    maxRequests:   config.maxRequests,
    windowSeconds: config.windowSeconds,
  });
  if (!result.success) {
    throw new HttpError(429, `Too many requests — try again in ${result.retryAfter ?? 60}s`);
  }
}

export async function rateLimitByIp(
  request: Request,
  key: string,
  config: { maxRequests: number; windowSeconds: number },
): Promise<void> {
  const ip = getClientIp(request.headers) ?? 'unknown';
  const result = await checkRateLimit({
    identifier: `${key}:${getRequestIdentifier(null, ip)}`,
    maxRequests:   config.maxRequests,
    windowSeconds: config.windowSeconds,
  });
  if (!result.success) {
    throw new HttpError(429, 'Too many requests');
  }
}

export { RATE_LIMITS };

// ---------------------------------------------------------------------------
// Prompt-safe rendering of user content
// ---------------------------------------------------------------------------

/**
 * Sanitize arbitrary user content for inclusion in an LLM prompt.
 *
 * Strips zero-width / control characters, collapses whitespace, truncates,
 * and escapes characters that would break the delimiter-wrapped rendering
 * produced by renderUserContent().
 *
 * This is not a security boundary on its own — we pair it with clearly
 * delimited blocks and an explicit instruction in the system prompt that
 * wrapped content is DATA, not INSTRUCTIONS.
 */
export function sanitizeForPrompt(input: unknown, maxLen = 600): string {
  if (input == null) return '';
  const raw = typeof input === 'string' ? input : String(input);
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ') // control chars
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '') // zero-width / bidi
    .replace(/```/g, '``\u200C`')   // break markdown fences
    .replace(/\]\]\]/g, ']]\u200C]') // break our delimiter sentinels
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Wrap a user-provided value in an unambiguous delimiter that we instruct
 * the model to treat as opaque data. Returns `[[[EMPTY]]]` for empty input
 * so the label still appears in the prompt.
 */
export function renderUserContent(value: unknown, maxLen = 600): string {
  const clean = sanitizeForPrompt(value, maxLen);
  return clean ? `[[[${clean}]]]` : '[[[EMPTY]]]';
}
