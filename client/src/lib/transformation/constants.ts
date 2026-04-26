// src/lib/transformation/constants.ts
//
// Constants for the Transformation Report feature. The narrative
// synthesis itself, the redaction detector, and the prompt design
// live in their own modules added in subsequent commits — this file
// is just the literal strings + numeric thresholds the rest of the
// codebase needs to reference (Inngest event name, the 24-hour
// reopen window, the publish-state and stage enums).

/**
 * Inngest event name for the durable transformation-report job.
 * Fired by the ventures PATCH route when a venture transitions to
 * `completed`. Consumer: `transformationReportFunction` in
 * `src/inngest/functions/transformation-report-function.ts` (added
 * in the next commit).
 */
export const TRANSFORMATION_REPORT_EVENT = 'discovery/transformation.requested' as const;

/**
 * Window during which a freshly-completed venture can be reopened
 * back to active. Mark Complete is otherwise terminal — this is the
 * regret-trap escape hatch. Long enough to catch genuine "wait, I
 * meant to pause" mistakes; short enough that the transformation
 * report archive stays meaningful (a report that vanishes a week
 * later is worse than no report).
 *
 * Reopening within the window also DELETES the TransformationReport
 * row so a subsequent re-completion regenerates fresh narrative
 * from any new data.
 */
export const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Pipeline stages the Inngest worker writes to TransformationReport.stage
 * at each step.run boundary. The viewer polls the row and renders a
 * progress ladder from these.
 */
export const TRANSFORMATION_STAGES = [
  'queued',
  'loading_data',
  'drafting',
  'detecting_redactions',
  'persisting',
  'complete',
  'failed',
] as const;
export type TransformationStage = typeof TRANSFORMATION_STAGES[number];

/**
 * Publish lifecycle, independent of the pipeline stage. The default
 * 'private' is the only state the founder is in by default; any
 * transition out of 'private' requires explicit consent in the
 * redaction editor (added in a later commit).
 *
 *   private        — only visible to the founder (default)
 *   pending_review — founder requested publish, awaiting curation.
 *                    No curation UI shipped yet — sits in DB.
 *   public         — live at /stories/[publicSlug] (route added
 *                    in a later commit when curation lands)
 *   unpublished    — was public, founder pulled it
 */
export const TRANSFORMATION_PUBLISH_STATES = [
  'private',
  'pending_review',
  'public',
  'unpublished',
] as const;
export type TransformationPublishState = typeof TRANSFORMATION_PUBLISH_STATES[number];

/**
 * Returns true when a completed venture is still inside its 24-hour
 * reopen window. Consumed by the ventures PATCH route (to gate the
 * `completed → active` transition) AND by the VentureCard UI (to
 * decide whether to render the Reopen button).
 */
export function isWithinReopenWindow(completedAt: Date | string | null | undefined): boolean {
  if (!completedAt) return false;
  const ts = typeof completedAt === 'string' ? Date.parse(completedAt) : completedAt.getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < REOPEN_WINDOW_MS;
}
