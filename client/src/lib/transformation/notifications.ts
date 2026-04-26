// src/lib/transformation/notifications.ts
//
// Push-notification wiring for transformation-report completion +
// failure, mirroring the tool-jobs pattern. Both deliveries are
// best-effort — a failed push never fails the underlying job, so a
// founder watching a backgrounded tab can always discover the
// result via the in-app surface.

import 'server-only';
import { sendPushToUser } from '@/lib/push/send-push';
import { logger } from '@/lib/logger';

interface NotifyInput {
  userId:      string;
  ventureId:   string;
  ventureName: string;
}

/**
 * Fire a "your transformation report is ready" push. Tap-target
 * data carries ventureId + a kind discriminator so the mobile
 * notification handler can deep-link to the report viewer.
 */
export async function notifyTransformationComplete(input: NotifyInput): Promise<void> {
  try {
    await sendPushToUser(
      input.userId,
      'Your transformation report is ready',
      `${input.ventureName} — read what changed for you.`,
      {
        kind:      'transformation_complete',
        ventureId: input.ventureId,
      },
    );
  } catch (err) {
    logger.warn('[TransformationReport] complete push failed', {
      ventureId: input.ventureId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fire a "we couldn't finish your report" push so the founder isn't
 * left waiting on a stalled progress bar in a backgrounded tab.
 */
export async function notifyTransformationFailed(input: NotifyInput & { errorMessage: string }): Promise<void> {
  try {
    await sendPushToUser(
      input.userId,
      'Transformation report failed',
      `Something went wrong generating ${input.ventureName}'s report. Tap to see what happened.`,
      {
        kind:         'transformation_failed',
        ventureId:    input.ventureId,
        errorMessage: input.errorMessage,
      },
    );
  } catch (err) {
    logger.warn('[TransformationReport] failure push failed', {
      ventureId: input.ventureId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
