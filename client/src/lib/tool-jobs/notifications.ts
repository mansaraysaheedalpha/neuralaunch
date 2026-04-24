// src/lib/tool-jobs/notifications.ts
//
// Push-notification wiring for ToolJob completion. Uses the existing
// sendPushToUser helper which already respects the user's
// nudgesEnabled preference and registered device tokens. No tier
// gate — both Execute and Compound tier founders get the
// notification when their background work finishes.

import 'server-only';
import { sendPushToUser } from '@/lib/push/send-push';
import { logger } from '@/lib/logger';
import { TOOL_DISPLAY_LABELS, type ToolJobType } from './schemas';

/**
 * Fire a "background work finished" push to the founder. Best-effort
 * — failure to push never fails the underlying job.
 */
export async function notifyToolJobComplete(input: {
  userId:    string;
  jobId:     string;
  toolType:  ToolJobType;
  roadmapId: string;
  sessionId: string;
}): Promise<void> {
  const label = TOOL_DISPLAY_LABELS[input.toolType];
  try {
    await sendPushToUser(
      input.userId,
      'Your work is ready',
      `Your ${label} is ready to view — tap to open.`,
      {
        kind:      'tool_job_complete',
        jobId:     input.jobId,
        toolType:  input.toolType,
        roadmapId: input.roadmapId,
        sessionId: input.sessionId,
      },
    );
  } catch (err) {
    logger.warn('[ToolJob] complete push failed', {
      jobId: input.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fire a "background work failed" push so the founder isn't left
 * staring at a stalled progress bar on a tab they navigated away
 * from. Same best-effort delivery.
 */
export async function notifyToolJobFailed(input: {
  userId:       string;
  jobId:        string;
  toolType:     ToolJobType;
  roadmapId:    string;
  sessionId:    string;
  errorMessage: string;
}): Promise<void> {
  const label = TOOL_DISPLAY_LABELS[input.toolType];
  try {
    await sendPushToUser(
      input.userId,
      'Background work hit a snag',
      `Your ${label} did not finish. Tap to retry.`,
      {
        kind:         'tool_job_failed',
        jobId:        input.jobId,
        toolType:     input.toolType,
        roadmapId:    input.roadmapId,
        sessionId:    input.sessionId,
        errorMessage: input.errorMessage,
      },
    );
  } catch (err) {
    logger.warn('[ToolJob] failure push failed', {
      jobId: input.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
