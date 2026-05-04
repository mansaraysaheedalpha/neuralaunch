// src/lib/tool-jobs/queue.ts
//
// Helper that wraps `inngest.send` for a freshly-created ToolJob with
// automatic orphan cleanup. The accept-and-queue routes follow the
// pattern:
//
//   const job = await createToolJob({ ... });
//   await sendToolJobEvent(job.id, { name, data }, traceHeaders);
//
// If `inngest.send` fails (transient network issue, Inngest 5xx,
// signing-key misconfig in dev), the freshly-created ToolJob row
// would otherwise sit in 'queued' state forever — no worker will ever
// pick it up and the founder is left polling a dead jobId. The helper
// deletes the orphan row before re-throwing, so the route returns 500
// to the client and the next retry has a clean slate.

import 'server-only';
import { inngest } from '@/inngest/client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { DistributedTraceHeaders } from '@/lib/observability';

/**
 * Send an Inngest event for a ToolJob that was just created via
 * `createToolJob`. On send failure the orphan ToolJob row is deleted
 * before the error re-throws, so the route can return 500 cleanly
 * without stranding a row in the DB.
 *
 * Optional `traceHeaders` propagates the route's current Sentry trace
 * context into the event payload's `sentryTrace` + `baggage` fields,
 * enabling end-to-end trace stitching from route → Inngest → worker →
 * engine. The 6 Tier-1 tool event types declare these fields as
 * optional in `inngest/client.ts`'s NeuraLaunchEvents map. Existing
 * callers that don't pass headers continue working unchanged
 * (additive parameter, default undefined).
 */
export async function sendToolJobEvent(
  jobId: string,
  event: Parameters<typeof inngest.send>[0],
  traceHeaders?: DistributedTraceHeaders,
): Promise<void> {
  // Merge trace headers into the event's data payload when present.
  // The event's data shape carries `sentryTrace?` + `baggage?` for the
  // 6 Tier-1 tool events that need stitching; for other events the
  // merge is harmless because the merged fields stay optional.
  const finalEvent = traceHeaders && (traceHeaders.sentryTrace || traceHeaders.baggage)
    ? mergeTraceHeaders(event, traceHeaders)
    : event;

  try {
    await inngest.send(finalEvent);
  } catch (sendErr) {
    // Best-effort cleanup — never let a failed cleanup mask the real
    // send failure. The user's request returns 500 either way.
    await prisma.toolJob
      .delete({ where: { id: jobId } })
      .catch(() => { /* swallow — orphan log line below covers it */ });
    logger.child({ module: 'tool-jobs/queue', jobId }).error(
      '[sendToolJobEvent] inngest.send failed; orphan ToolJob row cleaned up',
      sendErr instanceof Error ? sendErr : new Error(String(sendErr)),
    );
    throw sendErr;
  }
}

/**
 * Type-safe header merge. The runtime shape is just object spread; the
 * cast is necessary because TypeScript's discriminated union on the
 * event name means the merged data type can't be narrowed without
 * knowing the event name at compile time. The 6 Tier-1 tool events
 * accept `sentryTrace?` and `baggage?`, so the runtime merge is safe
 * for those callsites; the helper signature lets the route catch any
 * event-shape drift at the call site.
 */
function mergeTraceHeaders(
  event: Parameters<typeof inngest.send>[0],
  headers: DistributedTraceHeaders,
): Parameters<typeof inngest.send>[0] {
  if (Array.isArray(event)) {
    // Array dispatch isn't used by tool-job routes today — handle defensively.
    return event.map(e => ({
      ...e,
      data: { ...(e as { data: Record<string, unknown> }).data, ...headers },
    })) as Parameters<typeof inngest.send>[0];
  }
  return {
    ...event,
    data: { ...(event as { data: Record<string, unknown> }).data, ...headers },
  } as Parameters<typeof inngest.send>[0];
}
