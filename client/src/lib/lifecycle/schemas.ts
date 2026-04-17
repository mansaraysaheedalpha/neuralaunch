// src/lib/lifecycle/schemas.ts
//
// Zod schemas for the two structured JSON documents the lifecycle
// memory architecture persists:
//
//   FounderProfileSchema — L1 memory. Stored in FounderProfile.profile.
//   CycleSummarySchema   — L2 memory. Stored in Cycle.summary.
//
// TypeScript types are inferred — never duplicated.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// L1 — Founder Profile (§4.5 of the spec)
// ---------------------------------------------------------------------------

export const FounderProfileSchema = z.object({
  stableContext: z.object({
    name:             z.string(),
    location:         z.string(),
    country:          z.string(),
    background:       z.string(),
    skills:           z.array(z.string()),
    education:        z.string().optional(),
    technicalAbility: z.string(),
    languages:        z.array(z.string()),
  }),
  currentSituation: z.object({
    primaryFocus:          z.string(),
    availableHoursPerWeek: z.number(),
    financialConstraints:  z.string(),
    teamComposition:       z.string(),
    toolsAndResources:     z.string().optional(),
    activeVentureNames:    z.array(z.string()),
  }),
  behaviouralCalibration: z.object({
    realSpeedMultiplier:   z.number(),
    taskAvoidancePatterns: z.array(z.string()),
    toolPreferences:       z.array(z.string()),
    checkInDetailLevel:    z.enum(['sparse', 'moderate', 'detailed']),
    pushbackTendency:      z.enum(['accepts_quickly', 'challenges_thoroughly', 'mixed']),
    responseToNudges:      z.enum(['responsive', 'ignores', 'delayed']),
    outreachComfortLevel:  z.enum(['avoids', 'neutral', 'proactive']),
    strengths:             z.array(z.string()),
  }),
  journeyOverview: z.object({
    completedVentures:      z.number(),
    completedCycles:        z.number(),
    totalTasksCompleted:    z.number(),
    mostRecentVentureName:  z.string().optional(),
    mostRecentVentureStatus: z.string().optional(),
  }),
});
export type FounderProfile = z.infer<typeof FounderProfileSchema>;

// ---------------------------------------------------------------------------
// L2 — Cycle Summary (§4.6 of the spec)
// ---------------------------------------------------------------------------

export const CycleSummarySchema = z.object({
  cycleNumber:    z.number(),
  duration: z.object({
    startDate: z.string(),
    endDate:   z.string(),
    totalDays: z.number(),
  }),
  recommendationType:    z.string(),
  recommendationSummary: z.string(),
  keyAssumptions:        z.array(z.string()),

  execution: z.object({
    tasksCompleted:         z.number(),
    tasksBlocked:           z.number(),
    tasksSkipped:           z.number(),
    totalTasks:             z.number(),
    completionPercentage:   z.number(),
    highlightedCompletions: z.array(z.string()),
    commonBlockReasons:     z.array(z.string()),
  }),

  toolUsage: z.object({
    coachSessions:       z.number(),
    coachHighlights:     z.array(z.string()),
    composerSessions:    z.number(),
    messagesSent:        z.number(),
    messagesGenerated:   z.number(),
    researchSessions:    z.number(),
    researchKeyFindings: z.array(z.string()),
    packagerSessions:    z.number(),
    pricingDefined:      z.boolean(),
  }),

  checkInPatterns: z.object({
    frequency:       z.enum(['daily', 'weekly', 'sporadic', 'rare']),
    recurringThemes: z.array(z.string()),
    progressTrend:   z.enum(['accelerating', 'steady', 'decelerating', 'stalled']),
  }),

  continuationConclusion:   z.string(),
  validatedAssumptions:     z.array(z.string()),
  invalidatedAssumptions:   z.array(z.string()),
  keyLearnings:             z.array(z.string()),

  forkSelected: z.object({
    forkIndex:    z.number(),
    forkSummary:  z.string(),
    founderReason: z.string().optional(),
  }).optional(),

  calibrationAdjustments: z.object({
    speedMultiplierChange:  z.number().optional(),
    newAvoidancePatterns:   z.array(z.string()),
    newStrengths:           z.array(z.string()),
    toolPreferenceShifts:   z.array(z.string()),
  }),
});
export type CycleSummary = z.infer<typeof CycleSummarySchema>;

// ---------------------------------------------------------------------------
// Safe parsers — used when reading JSON columns from the database
// ---------------------------------------------------------------------------

export function safeParseFounderProfile(value: unknown): FounderProfile | null {
  const result = FounderProfileSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function safeParseCycleSummary(value: unknown): CycleSummary | null {
  const result = CycleSummarySchema.safeParse(value);
  return result.success ? result.data : null;
}
