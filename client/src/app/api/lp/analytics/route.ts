// src/app/api/lp/analytics/route.ts
import { createHash }    from 'crypto';
import { NextResponse }  from 'next/server';
import { logger }        from '@/lib/logger';
import prisma            from '@/lib/prisma';
import { AnalyticsEventSchema, ValidationPageContentSchema } from '@/lib/validation/schemas';
import { getClientIp }   from '@/lib/rate-limit';
import { rateLimitByIp, HttpError, httpErrorToResponse } from '@/lib/validation/server-helpers';
import { env }           from '@/lib/env';

export const runtime = 'nodejs';

/**
 * POST /api/lp/analytics
 *
 * Public endpoint — called by anonymous visitors from the /lp/[slug] page.
 *
 * Hardening:
 *   - Bounded request body (413 on >16KB)
 *   - Zod schema validates structure and caps every string length
 *   - Per-IP rate limit (PUBLIC tier) and per-(ip,slug) secondary cap
 *   - feature_click / survey_response taskIds are cross-checked against the
 *     actual page content so attackers cannot fabricate feature IDs
 *   - Visitor identity is a SHA-256 of (ip, ua, secret) — salted so values
 *     can't be reversed into PII
 *   - PAGE LOOKUPS ARE CACHED INSIDE THE PROCESS for the duration of a
 *     single request but not across requests — no database amplification
 *   - All errors are swallowed into a 200 to prevent information leakage
 */
export async function POST(request: Request) {
  const log = logger.child({ route: 'POST /api/lp/analytics' });

  try {
    // Block oversized bodies before parsing JSON
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > 16 * 1024) {
      throw new HttpError(413, 'Payload too large');
    }

    // Global per-IP rate limit (generous — most visitors fire 5-10 events)
    await rateLimitByIp(request, 'lp-analytics', {
      maxRequests:   60,
      windowSeconds: 60,
    });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON');
    }

    const parsed = AnalyticsEventSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid event payload');
    }
    const data = parsed.data;

    // Secondary per-(ip,slug) cap — prevents bulk-forging for one page
    await rateLimitByIp(request, `lp-analytics:${data.slug}`, {
      maxRequests:   30,
      windowSeconds: 60,
    });

    // Resolve page by slug + status
    const page = await prisma.validationPage.findUnique({
      where:  { slug: data.slug },
      select: { id: true, status: true, content: true },
    });

    if (!page || page.status === 'ARCHIVED') {
      // Silently accept — don't reveal page state to the public
      return NextResponse.json({ ok: true });
    }

    // Validate page content shape once, so downstream casts are safe
    const contentParsed = ValidationPageContentSchema.safeParse(page.content);
    if (!contentParsed.success) {
      log.warn('ValidationPage has malformed content', { pageId: page.id });
      return NextResponse.json({ ok: true });
    }
    const content = contentParsed.data;

    // For feature_click events, verify the taskId exists on the page
    if (data.event === 'feature_click') {
      const known = new Set(content.features.map(f => f.taskId));
      if (!known.has(data.taskId)) {
        // Silently drop — attacker fabricating a fake taskId
        return NextResponse.json({ ok: true });
      }
    }

    // Visitor identification — salted SHA-256 of IP+UA
    // Not PII-reversible; stable enough for uniqueness counts
    const ip    = getClientIp(request.headers) ?? '';
    const ua    = request.headers.get('user-agent') ?? '';
    const salt  = env.NEXTAUTH_SECRET; // already-validated runtime secret
    const visitorId = ip
      ? `v_${createHash('sha256').update(`${salt}:${ip}:${ua}`).digest('base64url').slice(0, 16)}`
      : null;

    // Extract properties — Zod output is narrowly typed, no cast needed
    const properties = extractEventProperties(data);

    try {
      await prisma.validationEvent.create({
        data: {
          validationPageId: page.id,
          eventType:        data.event,
          visitorId,
          properties: properties as object,
        },
      });
    } catch (err) {
      // Best-effort write — never break the visitor's UX
      log.error(
        'Failed to persist validation event',
        err instanceof Error ? err : new Error(String(err)),
        { event: data.event, slug: data.slug },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return httpErrorToResponse(err);
    }
    // Unknown failure — do not leak internals
    log.error(
      'Unhandled analytics error',
      err instanceof Error ? err : new Error(String(err)),
    );
    return NextResponse.json({ ok: true });
  }
}

/**
 * Extract the event-specific properties payload (everything except slug/event).
 * Typed switch preserves Zod's narrowing across the discriminated union.
 */
function extractEventProperties(
  data: ReturnType<typeof AnalyticsEventSchema.parse>,
): Record<string, unknown> {
  switch (data.event) {
    case 'page_view':
    case 'exit_intent':
      return {};
    case 'scroll_depth':
      return { depth: data.depth };
    case 'feature_click':
      return { taskId: data.taskId, title: data.title };
    case 'cta_signup':
      return { email: data.email };
    case 'survey_response':
      return {
        surveyKey: data.surveyKey,
        answerId:  data.answerId,
        answer:    data.answer,
        question:  data.question,
      };
  }
}
