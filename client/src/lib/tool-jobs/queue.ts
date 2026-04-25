// src/lib/tool-jobs/queue.ts
//
// Helper that wraps `inngest.send` for a freshly-created ToolJob with
// automatic orphan cleanup. The accept-and-queue routes follow the
// pattern:
//
//   const job = await createToolJob({ ... });
//   await sendToolJobEvent(job.id, { name, data });
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

/**
 * Send an Inngest event for a ToolJob that was just created via
 * `createToolJob`. On send failure the orphan ToolJob row is deleted
 * before the error re-throws, so the route can return 500 cleanly
 * without stranding a row in the DB.
 */
export async function sendToolJobEvent(
  jobId: string,
  event: Parameters<typeof inngest.send>[0],
): Promise<void> {
  try {
    await inngest.send(event);
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
