// src/app/api/user/delete-account/route.ts
//
// Account deletion entry point. Validates ownership + a typed-out
// DELETE confirmation, then queues the durable
// accountDeletionFunction saga and returns 202 immediately.
//
// The actual work (Paddle cancellation → session revocation → User
// row delete → cascade wipe → tier cache invalidation) happens in
// Inngest because Paddle's cancel API is an external dependency that
// can transiently fail. A half-applied deletion is strictly worse
// than no deletion, so the saga must be retryable.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inngest } from '@/inngest/client';
import { logger } from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByIp,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { ACCOUNT_DELETION_EVENT } from '@/lib/auth/account-deletion-constants';

// Founder must type-out DELETE in the confirmation dialog. The
// literal-string match is the destructive-action guard pattern —
// equivalent to GitHub asking you to type the repo name to delete.
const BodySchema = z.object({
  confirmation: z.literal('DELETE'),
});

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    // IP-tier rate limit BEFORE userId resolution — prevents an
    // attacker who steals a session token from rapid-firing the
    // endpoint. AUTH tier (5/15min/IP) is appropriate because the
    // outcome is irreversible; bursts past that are abuse.
    await rateLimitByIp(request, 'account-delete', RATE_LIMITS.AUTH);
    const userId = await requireUserId(request);

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Type DELETE to confirm');
    }

    // Queue the durable saga. Inngest's send is the only DB-style
    // operation here — the saga itself owns ownership scoping (the
    // userId in the event payload is sourced from requireUserId so
    // the founder can only delete their own account).
    await inngest.send({
      name: ACCOUNT_DELETION_EVENT,
      data: { userId },
    });

    logger.info('Account-deletion saga queued', { userId });

    // 202 Accepted — the saga runs asynchronously. Client should sign
    // the user out and redirect to /signin; once the User row deletes
    // their NextAuth session callback returns no user and any future
    // navigation lands on /signin anyway.
    return NextResponse.json({ ok: true, queued: true }, { status: 202 });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
