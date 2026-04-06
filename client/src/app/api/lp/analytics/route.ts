// src/app/api/lp/analytics/route.ts
import { NextResponse }  from 'next/server';
import { z }             from 'zod';
import { logger }        from '@/lib/logger';
import prisma            from '@/lib/prisma';

/**
 * POST /api/lp/analytics
 *
 * Public endpoint — no authentication required (called from visitors' browsers).
 * Accepts analytics events from the validation landing page:
 *   - page_view      : visitor lands on the page
 *   - feature_click  : visitor taps "Notify me" on a feature card
 *   - cta_signup     : visitor submits the email signup form
 *   - survey_response: visitor submits an entry or exit-intent survey answer
 *
 * Events are recorded by updating the ValidationPage record's channelsCompleted
 * or by forwarding to PostHog if a posthogPropertyId is set on the page.
 * The write is best-effort: a failure here must never break the visitor's UX.
 */

const AnalyticsEventSchema = z.discriminatedUnion('event', [
  z.object({
    slug:  z.string().min(1).max(120),
    event: z.literal('page_view'),
  }),
  z.object({
    slug:  z.string().min(1).max(120),
    event: z.literal('scroll_depth'),
    depth: z.number().int().min(0).max(100),
  }),
  z.object({
    slug:  z.string().min(1).max(120),
    event: z.literal('exit_intent'),
  }),
  z.object({
    slug:   z.string().min(1).max(120),
    event:  z.literal('feature_click'),
    taskId: z.string().min(1),
    title:  z.string().min(1),
  }),
  z.object({
    slug:  z.string().min(1).max(120),
    event: z.literal('cta_signup'),
    email: z.string().email(),
  }),
  z.object({
    slug:      z.string().min(1).max(120),
    event:     z.literal('survey_response'),
    surveyKey: z.enum(['entry', 'exit']),
    answerId:  z.string().min(1),
    answer:    z.string().min(1),
    question:  z.string().min(1),
  }),
]);

export async function POST(request: Request) {
  const log = logger.child({ route: 'POST /api/lp/analytics' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AnalyticsEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event payload' }, { status: 400 });
  }

  const data = parsed.data;

  // Verify the slug refers to a live (or draft-preview) validation page
  const page = await prisma.validationPage.findUnique({
    where:  { slug: data.slug },
    select: { id: true, status: true },
  });

  if (!page || page.status === 'ARCHIVED') {
    // Return 200 silently — no need to expose the page state to the public
    return NextResponse.json({ ok: true });
  }

  log.debug('Validation analytics event', { slug: data.slug, event: data.event });

  // Extract event-specific properties (everything except slug + event)
  const { slug: _slug, event, ...properties } = data as Record<string, unknown> & { slug: string; event: string };
  void _slug;

  // Visitor identification: the request's x-forwarded-for or the slug itself.
  // We don't set a cookie so distinct_count is a rough lower bound — good
  // enough for the "moderate vs strong signal" distinction the interpreter cares about.
  const ipHeader = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '';
  const visitorId = ipHeader ? hashString(ipHeader) : null;

  try {
    await prisma.validationEvent.create({
      data: {
        validationPageId: page.id,
        eventType:        event,
        visitorId,
        properties:       properties as object,
      },
    });
  } catch (err) {
    // Non-fatal — we never want a write failure to break the visitor's page
    log.error('Failed to persist validation event', { error: String(err) });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Tiny non-cryptographic hash for visitor identification.
 * We're not protecting secrets — just grouping events from the same IP
 * within a reporting window. A stable short string is all we need.
 */
function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return `v_${Math.abs(hash).toString(36)}`;
}
