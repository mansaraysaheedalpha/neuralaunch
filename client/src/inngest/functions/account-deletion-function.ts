// src/inngest/functions/account-deletion-function.ts
//
// Durable saga for GDPR Article 17 / ToS §9.6 account deletion. Fires
// on `user/account.delete.requested` after the route validates the
// founder's "DELETE" confirmation and returns 202.
//
// Why durable: Paddle's cancel endpoint is an external dependency
// that can transiently fail. A half-applied deletion (Paddle still
// billing the customer's card while the local User row is gone) is
// strictly worse than no deletion — the founder cannot log back in
// to fix it, and we cannot reconcile from our side because the row
// no longer exists. Each step.run boundary memoises so a failed
// retry resumes from the failed step rather than re-running Paddle
// cancellations that already succeeded.
//
// Per-user concurrency cap of 1 prevents a confused-state race if a
// founder somehow fires the deletion endpoint twice — the second
// invocation queues, then the saga's first step (`cancel-paddle`)
// short-circuits because `cancelPaddleSubscriptionsForUser` filters
// out already-cancelled rows.
//
// Order matters:
//   1. Cancel Paddle subscriptions FIRST. If this fails, abort —
//      the local row stays so the founder can retry once Paddle is
//      reachable.
//   2. Revoke Sessions / PushTokens. Logs out every device and
//      stops device-targeted push.
//   3. Delete User row. Schema cascades wipe every downstream
//      artefact (Subscription, Conversations, DiscoverySession,
//      Recommendation, Roadmap, ValidationPage, Venture, ToolJob,
//      RecommendationOutcome, FounderProfile, TransformationReport,
//      TierTransition, etc.).
//   4. Invalidate tier cache. The User is gone; any cached entry
//      would resolve to EMPTY ('free') anyway, but explicitly
//      dropping both L1 and L2 is cheaper than an extra DB read on
//      the unlikely follow-up session callback.

import { inngest } from '../client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { cancelPaddleSubscriptionsForUser } from '@/lib/paddle/account-deletion';
import { invalidateTierCache } from '@/lib/auth/tier-cache';
import { ACCOUNT_DELETION_EVENT } from '@/lib/auth/account-deletion-constants';
import {
  withInngestQueueSpan,
  withDistributedTrace,
} from '@/lib/observability';

export const accountDeletionFunction = inngest.createFunction(
  {
    id:       'user-account-deletion',
    name:     'User — Account Deletion Saga',
    // Two retries on transient Paddle / Postgres failures. Past that,
    // the saga marks itself failed and the founder retries via the UI.
    retries:  2,
    // Per-user concurrency cap so two simultaneous deletion fires for
    // the same user serialise. The second one no-ops once the first
    // commits (no row left to delete; Paddle filter excludes already-
    // cancelled subscriptions).
    concurrency: [{ limit: 1, key: 'event.data.userId' }],
    triggers: [{ event: ACCOUNT_DELETION_EVENT }],
  },
  async ({ event, step, runId, attempt }) => {
    const sentryTrace = (event.data as { sentryTrace?: string }).sentryTrace;
    const baggage     = (event.data as { baggage?: string }).baggage;
    return withDistributedTrace(
      { sentryTrace, baggage },
      () => withInngestQueueSpan(
        { functionId: 'user-account-deletion', eventName: event.name, runId, attempt },
        async () => {
    // Inngest's typed generic carries the NeuraLaunchEvents payload
    // shape but the union of registered event triggers widens it; an
    // explicit narrow keeps the rest of the function strictly typed.
    const { userId } = event.data as { userId: string };
    const log = logger.child({
      inngestFunction: 'accountDeletion',
      userId,
      runId:           event.id,
    });

    // Ownership / existence guard. If the user is already gone (e.g. a
    // racing duplicate event after the first saga succeeded) the saga
    // becomes a no-op rather than throwing.
    const userExists = await step.run('check-user-exists', async () => {
      const row = await prisma.user.findUnique({
        where:  { id: userId },
        select: { id: true },
      });
      return Boolean(row);
    });

    if (!userExists) {
      log.info('Account-deletion saga — user already deleted, no-op');
      return { skipped: true };
    }

    // -----------------------------------------------------------------
    // Step 1 — Cancel Paddle subscriptions
    // -----------------------------------------------------------------
    // If Paddle is unreachable, throw; Inngest retries the whole
    // function. The user row stays so the saga re-tries safely. The
    // helper is idempotent — already-cancelled rows are filtered out
    // by its where clause.
    const paddleCancelled = await step.run('cancel-paddle-subscriptions', async () => {
      const count = await cancelPaddleSubscriptionsForUser(userId);
      log.info('Account-deletion saga — Paddle subscriptions cancelled', { count });
      return count;
    });

    // -----------------------------------------------------------------
    // Step 2 — Revoke all sessions and push tokens
    // -----------------------------------------------------------------
    // Forces a logout on every web tab and mobile device. Push
    // notifications are silenced. Both are safe-to-retry deleteMany
    // operations.
    const { sessionsRevoked, pushTokensRevoked } = await step.run('revoke-sessions-and-push', async () => {
      const [sessions, tokens] = await Promise.all([
        prisma.session.deleteMany({ where: { userId } }),
        prisma.pushToken.deleteMany({ where: { userId } }),
      ]);
      return {
        sessionsRevoked:   sessions.count,
        pushTokensRevoked: tokens.count,
      };
    });

    // -----------------------------------------------------------------
    // Step 3 — Delete the User row
    // -----------------------------------------------------------------
    // Cascades wipe every downstream artefact. Wrapped in step.run so
    // a transient Postgres error retries cleanly (the User row still
    // exists and the cascade will run again from clean state).
    await step.run('delete-user-row', async () => {
      await prisma.user.delete({ where: { id: userId } });
      log.info('Account-deletion saga — User row deleted', {
        paddleCancelled,
        sessionsRevoked,
        pushTokensRevoked,
      });
    });

    // -----------------------------------------------------------------
    // Step 4 — Drop tier cache
    // -----------------------------------------------------------------
    // Belt-and-braces. The User is gone, so a future session callback
    // returns EMPTY anyway, but explicitly invalidating both L1 + L2
    // saves one DB round-trip on the unlikely follow-up read.
    await step.run('invalidate-tier-cache', async () => {
      await invalidateTierCache(userId);
    });

    return {
      ok: true,
      paddleCancelled,
      sessionsRevoked,
      pushTokensRevoked,
    };
        },
      ),
    );
  },
);
