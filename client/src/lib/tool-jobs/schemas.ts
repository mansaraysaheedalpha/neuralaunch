// src/lib/tool-jobs/schemas.ts
//
// Zod schemas + TypeScript types for the ToolJob durable-execution
// system. See docs/inngest-tools-migration-plan-2026-04-24.md.

import { z } from 'zod';

/** Pipeline stage. Written by the Inngest function before each step.run. */
export const TOOL_JOB_STAGES = [
  'queued',
  'context_loaded',
  'researching',
  'emitting',
  'persisting',
  'complete',
  'failed',
] as const;

export type ToolJobStage = typeof TOOL_JOB_STAGES[number];

export const TERMINAL_STAGES: readonly ToolJobStage[] = ['complete', 'failed'] as const;

/** Discriminator for which engine the job invokes. */
export const TOOL_JOB_TYPES = [
  'research_execute',
  'research_followup',
  'composer_generate',
  'composer_regenerate',
  'coach_prepare',
  'coach_debrief',
  'packager_generate',
  'packager_adjust',
] as const;

export type ToolJobType = typeof TOOL_JOB_TYPES[number];

/**
 * Status payload returned by GET /tool-jobs/[jobId]/status. Lean
 * shape — the result body itself lives on roadmap.toolSessions and
 * is fetched via the per-tool single-session GET endpoint when the
 * client sees stage === 'complete'.
 */
export const ToolJobStatusSchema = z.object({
  id:           z.string(),
  toolType:     z.enum(TOOL_JOB_TYPES),
  stage:        z.enum(TOOL_JOB_STAGES),
  sessionId:    z.string(),
  errorMessage: z.string().nullable(),
  startedAt:    z.string(),
  updatedAt:    z.string(),
  completedAt:  z.string().nullable(),
});

export type ToolJobStatus = z.infer<typeof ToolJobStatusSchema>;

/**
 * Display label per stage. Used by the progress-ladder UI.
 * Order matters: index = position in the ladder. 'failed' is
 * deliberately omitted because it's an error path the UI renders
 * separately, not a step on the happy path.
 */
export const TOOL_JOB_STAGE_ORDER: ToolJobStage[] = [
  'queued',
  'context_loaded',
  'researching',
  'emitting',
  'persisting',
  'complete',
];

export const STAGE_LABELS: Record<ToolJobStage, string> = {
  queued:         'Queued',
  context_loaded: 'Loading context',
  researching:    'Researching',
  emitting:       'Writing report',
  persisting:     'Saving',
  complete:       'Done',
  failed:         'Failed',
};

/**
 * Per-tool override for the `emitting` stage label. The default
 * "Writing report" reads naturally for Research but feels off for
 * Packager / Composer / Coach. ToolJobProgress reads from this map
 * when a `toolType` prop is provided; falls back to STAGE_LABELS
 * otherwise.
 */
export const EMITTING_LABEL_BY_TOOL: Record<ToolJobType, string> = {
  research_execute:    'Writing report',
  research_followup:   'Writing report',
  packager_generate:   'Building package',
  packager_adjust:     'Applying adjustment',
  composer_generate:   'Drafting messages',
  composer_regenerate: 'Drafting variation',
  coach_prepare:       'Preparing rehearsal',
  coach_debrief:       'Writing debrief',
};

/**
 * Per-tool labels for the push-notification title. Composed in
 * notifications.ts when the job completes.
 */
export const TOOL_DISPLAY_LABELS: Record<ToolJobType, string> = {
  research_execute:    'research',
  research_followup:   'research follow-up',
  composer_generate:   'outreach messages',
  composer_regenerate: 'outreach variation',
  coach_prepare:       'conversation preparation',
  coach_debrief:       'conversation debrief',
  packager_generate:   'service package',
  packager_adjust:     'package adjustment',
};
