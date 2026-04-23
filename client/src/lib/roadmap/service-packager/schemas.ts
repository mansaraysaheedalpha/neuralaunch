// src/lib/roadmap/service-packager/schemas.ts
//
// Zod schemas for every data shape the Service Packager produces
// and persists. TypeScript types are inferred from these schemas —
// never duplicated.

import { z } from 'zod';
import { PACKAGER_BRIEF_FORMATS, PACKAGER_TOOL_ID } from './constants';

// CLAUDE.md: .max() on LLM output strings causes AI_NoObjectGeneratedError.
// Use .transform() post-clamp instead.
function clampString(max: number) {
  return (raw: string): string => raw.length <= max ? raw : raw.slice(0, max - 1) + '\u2026';
}

// ---------------------------------------------------------------------------
// Context — the pre-populated summary the founder confirms before generation
// ---------------------------------------------------------------------------

export const ServiceContextSchema = z.object({
  /** One-paragraph summary of what the founder is packaging. */
  serviceSummary:        z.string(),
  /** Who this service is for — audience description. */
  targetMarket:          z.string(),
  /** Competitor pricing range (from Research Tool findings when available). */
  competitorPricing:     z.string().optional(),
  /** Inferred founder costs (time, materials, transport) from belief state. */
  founderCosts:          z.string().optional(),
  /** Founder's available hours per week, pulled from belief state. */
  availableHoursPerWeek: z.string().optional(),
  /** The originating task description, when launched from a task card. */
  taskContext:           z.string().optional(),
  /**
   * Rendered summary of research findings when a researchSession
   * existed on the same task. Includes competitor, business, and
   * datapoint findings pre-digested for the generation prompt.
   */
  researchFindings:      z.string().optional(),
  /** The original research query from the task's researchSession, used
   *  by the UI badge to show "Informed by your research on [query]". */
  researchQuery:         z.string().optional(),
});
export type ServiceContext = z.infer<typeof ServiceContextSchema>;

// ---------------------------------------------------------------------------
// Package — the structured output the generation agent produces
// ---------------------------------------------------------------------------

const PackageIncludedItemSchema = z.object({
  item:        z.string().transform(clampString(200)),
  description: z.string().transform(clampString(500)),
});

const PackageTierSchema = z.object({
  /** Machine-friendly name: 'basic' | 'standard' | 'premium' | custom. */
  name:          z.string().transform(clampString(50)),
  /** Customer-facing name, e.g. "PremiumPress Standard". */
  displayName:   z.string().transform(clampString(100)),
  /** Price as the founder would quote it, e.g. "40 cedis/kg" or "$2,500". */
  price:         z.string().transform(clampString(100)),
  /** Billing period, e.g. "per month", "per kg", "per project". */
  period:        z.string().transform(clampString(100)),
  /** One-paragraph tier description the client reads. */
  description:   z.string().transform(clampString(600)),
  /** Feature list for the tier (3-8 bullets). */
  features:      z.array(z.string().transform(clampString(300))),
  /** One-sentence justification grounded in market/cost/positioning. */
  justification: z.string().transform(clampString(500)),
});

const PackageRevenueScenarioSchema = z.object({
  /** Label: conservative | moderate | ambitious. */
  label:          z.string().transform(clampString(50)),
  /** Number of clients at this scenario. */
  /**
   * Gemini's structured-output validator rejects `minimum` / `maximum`
   * on integer types outright — same class of provider divergence
   * CLAUDE.md flags for `.max()` on strings. Leave the type as an
   * int, put the non-negativity intent in .describe(), and clamp the
   * parsed value post-parse so a misbehaving model never leaves a
   * negative count in the database.
   */
  clients:        z.number().int()
                    .describe('Number of clients at this scenario — must be a non-negative integer.')
                    .transform(n => Math.max(n, 0)),
  /** Which tier(s) these clients are on, e.g. "2 Basic + 1 Standard". */
  tierMix:        z.string().transform(clampString(200)),
  /** Monthly revenue at this volume. */
  monthlyRevenue: z.string().transform(clampString(100)),
  /** Weekly hours the founder would spend at this volume. */
  weeklyHours:    z.string().transform(clampString(100)),
  /** When the founder would need to hire help. Optional. */
  hiringNote:     z.string().transform(clampString(300)).optional(),
});

export const ServicePackageSchema = z.object({
  serviceName:      z.string().transform(clampString(200)),
  targetClient:     z.string().transform(clampString(500)),
  included:         z.array(PackageIncludedItemSchema),
  notIncluded:      z.array(z.string().transform(clampString(300))),
  tiers:            z.array(PackageTierSchema),
  revenueScenarios: z.array(PackageRevenueScenarioSchema),
  /** The final one-page brief — copy-paste ready per briefFormat. */
  brief:            z.string().transform(clampString(4000)),
  briefFormat:      z.enum(PACKAGER_BRIEF_FORMATS),
});
export type ServicePackage = z.infer<typeof ServicePackageSchema>;

// ---------------------------------------------------------------------------
// Adjustment — one refinement round record
// ---------------------------------------------------------------------------

export const PackagerAdjustmentSchema = z.object({
  request: z.string(),
  round:   z.number().int().min(1),
});
export type PackagerAdjustment = z.infer<typeof PackagerAdjustmentSchema>;

// ---------------------------------------------------------------------------
// Session wrapper — persisted on the task or in roadmap.toolSessions
// ---------------------------------------------------------------------------

export const PackagerSessionSchema = z.object({
  id:          z.string(),
  tool:        z.literal(PACKAGER_TOOL_ID),
  context:     ServiceContextSchema,
  package:     ServicePackageSchema,
  adjustments: z.array(PackagerAdjustmentSchema).optional(),
  createdAt:   z.string(),
  updatedAt:   z.string(),
});
export type PackagerSession = z.infer<typeof PackagerSessionSchema>;

/**
 * Safely parse a packagerSession from a task's passthrough JSONB.
 */
export function safeParsePackagerSession(value: unknown): PackagerSession | null {
  const parsed = PackagerSessionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
