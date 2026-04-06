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
    select: { id: true, status: true, posthogPropertyId: true },
  });

  if (!page || page.status === 'ARCHIVED') {
    // Return 200 silently — no need to expose the page state to the public
    return NextResponse.json({ ok: true });
  }

  log.debug('Validation analytics event', { slug: data.slug, event: data.event });

  // PostHog forwarding is handled by the Inngest reporting function which
  // reads PostHog's API directly. This route is the thin intake layer only.
  // Additional storage (e.g. snapshot pre-aggregation) is added in Step 10.

  return NextResponse.json({ ok: true });
}
