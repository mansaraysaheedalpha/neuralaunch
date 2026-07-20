import { z } from 'zod';

export const TOOL_JOB_PROGRESS_KINDS = ['phase', 'search'] as const;
export const TOOL_JOB_PROGRESS_STATUSES = ['started', 'completed', 'failed'] as const;

export const ToolJobProgressEventSchema = z.object({
  id:         z.string(),
  kind:       z.enum(TOOL_JOB_PROGRESS_KINDS),
  status:     z.enum(TOOL_JOB_PROGRESS_STATUSES),
  label:      z.string().min(1).max(120),
  source:     z.string().min(1).max(40).nullable(),
  occurredAt: z.string(),
});

export type ToolJobProgressEvent = z.infer<typeof ToolJobProgressEventSchema>;
export type NewToolJobProgressEvent = Omit<ToolJobProgressEvent, 'id' | 'occurredAt'>;
