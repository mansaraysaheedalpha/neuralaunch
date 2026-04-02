// src/lib/discovery/context-schema.ts
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Belief field wrapper — every piece of information carries its own confidence
// ---------------------------------------------------------------------------

/**
 * Wraps any value type with a confidence score.
 * confidence 0 = completely unknown, 1 = certain.
 * value null means the system has not yet gathered this information.
 */
const beliefField = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value:         valueSchema.nullable(),
    confidence:    z.number().min(0).max(1),
    extractedAt:   z.string().datetime().nullable(),
  });

// ---------------------------------------------------------------------------
// Discovery Context — the complete belief state
// ---------------------------------------------------------------------------

/**
 * DiscoveryContextSchema
 *
 * The belief state the interview engine builds over the conversation.
 * Persisted as a Prisma JSON field. Updated via typed accessor functions only.
 * Fields are grouped by the interview phase that primarily populates them.
 */
export const DiscoveryContextSchema = z.object({
  // ORIENTATION — who is this person?
  situation:         beliefField(z.string()).describe('Current situation in their own words'),
  background:        beliefField(z.string()).describe('Relevant experience and skills'),
  whatTriedBefore:   beliefField(z.array(z.string())).describe('What they have already attempted'),

  // GOAL_CLARITY — what do they actually want?
  primaryGoal:       beliefField(z.string()).describe('The single most important thing they want to achieve'),
  successDefinition: beliefField(z.string()).describe('How they would know they had succeeded'),
  timeHorizon:       beliefField(z.string()).describe('Their realistic timeline expectation'),

  // CONSTRAINT_MAP — what do they have to work with?
  availableTimePerWeek: beliefField(z.string()).describe('Hours per week they can dedicate'),
  availableBudget:      beliefField(z.string()).describe('Financial resources available to start'),
  teamSize: beliefField(
    z.enum(['solo', 'small_team', 'established_team'])
  ).describe('Working alone or with others'),
  technicalAbility: beliefField(
    z.enum(['none', 'basic', 'intermediate', 'strong'])
  ).describe('Self-assessed technical skill level'),
  geographicMarket: beliefField(z.string()).describe('Primary market or location context'),

  // CONVICTION — how serious are they?
  commitmentLevel: beliefField(
    z.enum(['exploring', 'committed', 'all_in'])
  ).describe('How committed they are to following through'),
  biggestConcern:  beliefField(z.string()).describe('What they are most afraid of or worried about'),
  whyNow:          beliefField(z.string()).describe('Why they are doing this at this specific moment'),
});

export type DiscoveryContext = z.infer<typeof DiscoveryContextSchema>;
export type DiscoveryContextField = keyof DiscoveryContext;

// ---------------------------------------------------------------------------
// Empty context factory — creates a zeroed-out belief state
// ---------------------------------------------------------------------------

const emptyBelief = <T extends z.ZodTypeAny>(_schema: T) => ({
  value:       null as z.infer<T> | null,
  confidence:  0,
  extractedAt: null,
});

export function createEmptyContext(): DiscoveryContext {
  return {
    situation:            emptyBelief(z.string()),
    background:           emptyBelief(z.string()),
    whatTriedBefore:      emptyBelief(z.array(z.string())),
    primaryGoal:          emptyBelief(z.string()),
    successDefinition:    emptyBelief(z.string()),
    timeHorizon:          emptyBelief(z.string()),
    availableTimePerWeek: emptyBelief(z.string()),
    availableBudget:      emptyBelief(z.string()),
    teamSize:             emptyBelief(z.enum(['solo', 'small_team', 'established_team'])),
    technicalAbility:     emptyBelief(z.enum(['none', 'basic', 'intermediate', 'strong'])),
    geographicMarket:     emptyBelief(z.string()),
    commitmentLevel:      emptyBelief(z.enum(['exploring', 'committed', 'all_in'])),
    biggestConcern:       emptyBelief(z.string()),
    whyNow:               emptyBelief(z.string()),
  };
}
