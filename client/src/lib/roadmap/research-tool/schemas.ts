// src/lib/roadmap/research-tool/schemas.ts
//
// Zod schemas for every data shape the Research Tool produces.
// Types inferred from schemas — never duplicated.

import { z } from 'zod';
import { FINDING_TYPES, CONFIDENCE_LEVELS, RESEARCH_TOOL_ID } from './constants';

// CLAUDE.md: .transform() clamp on LLM output strings, never .max().
function clampString(max: number) {
  return (raw: string): string => raw.length <= max ? raw : raw.slice(0, max - 1) + '\u2026';
}

// ---------------------------------------------------------------------------
// Social media profile
// ---------------------------------------------------------------------------

export const SocialMediaProfileSchema = z.object({
  platform: z.string(),
  handle:   z.string(),
  url:      z.string(),
});
export type SocialMediaProfile = z.infer<typeof SocialMediaProfileSchema>;

// ---------------------------------------------------------------------------
// Contact information
// ---------------------------------------------------------------------------

export const ContactInfoSchema = z.object({
  website:         z.string().optional(),
  phone:           z.string().optional(),
  email:           z.string().optional(),
  socialMedia:     z.array(SocialMediaProfileSchema).optional(),
  physicalAddress: z.string().optional(),
});
export type ContactInfo = z.infer<typeof ContactInfoSchema>;

// ---------------------------------------------------------------------------
// Research finding
// ---------------------------------------------------------------------------

export const ResearchFindingSchema = z.object({
  title:       z.string().transform(clampString(300)),
  description: z.string().transform(clampString(2000)),
  type:        z.enum(FINDING_TYPES),
  location:    z.string().optional(),
  contactInfo: ContactInfoSchema.optional(),
  sourceUrl:   z.string(),
  confidence:  z.enum(CONFIDENCE_LEVELS),
});
export type ResearchFinding = z.infer<typeof ResearchFindingSchema>;

// ---------------------------------------------------------------------------
// Source citation
// ---------------------------------------------------------------------------

export const ResearchSourceSchema = z.object({
  title:     z.string().transform(clampString(200)),
  url:       z.string(),
  relevance: z.string().transform(clampString(300)),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

// ---------------------------------------------------------------------------
// Suggested next step (with cross-tool handoff)
// ---------------------------------------------------------------------------

export const SuggestedNextStepSchema = z.object({
  action:        z.string().transform(clampString(500)),
  suggestedTool: z.enum(['conversation_coach', 'outreach_composer', 'service_packager']).optional(),
  toolContext:   z.string().optional(),
});
export type SuggestedNextStep = z.infer<typeof SuggestedNextStepSchema>;

// ---------------------------------------------------------------------------
// Research report
// ---------------------------------------------------------------------------

export const ResearchReportSchema = z.object({
  summary:            z.string().transform(clampString(2000)),
  findings:           z.array(ResearchFindingSchema),
  sources:            z.array(ResearchSourceSchema),
  roadmapConnections: z.string().transform(clampString(1500)).optional(),
  suggestedNextSteps: z.array(SuggestedNextStepSchema).optional(),
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;

// ---------------------------------------------------------------------------
// Follow-up round
// ---------------------------------------------------------------------------

export const FollowUpRoundSchema = z.object({
  query:    z.string(),
  findings: z.array(ResearchFindingSchema),
  round:    z.number().int().min(1),
});
export type FollowUpRound = z.infer<typeof FollowUpRoundSchema>;

// ---------------------------------------------------------------------------
// Session wrapper
// ---------------------------------------------------------------------------

export const ResearchSessionSchema = z.object({
  id:        z.string(),
  tool:      z.literal(RESEARCH_TOOL_ID),
  query:     z.string(),
  plan:      z.string().optional(),
  report:    ResearchReportSchema.optional(),
  followUps: z.array(FollowUpRoundSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResearchSession = z.infer<typeof ResearchSessionSchema>;

/**
 * Safely parse a researchSession from a task's passthrough JSONB.
 */
export function safeParseResearchSession(value: unknown): ResearchSession | null {
  const parsed = ResearchSessionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
