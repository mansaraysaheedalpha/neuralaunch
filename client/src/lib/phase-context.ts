// src/lib/phase-context.ts
/**
 * Phase coordination — preparatory data layer (Concern 3).
 *
 * Each phase output (Recommendation, Roadmap, ValidationPage,
 * ValidationReport) carries a phaseContext metadata object describing
 * which phase produced it and which upstream rows it consumed.
 *
 * This module is the SINGLE source of truth for the phase numbering
 * and shape. It is intentionally tiny: no behaviour, no LLM calls, no
 * network — just constants and a small builder. The future
 * cross-phase orchestration layer reads phaseContext.upstream to walk
 * the dependency graph and decide whether a downstream signal
 * warrants a backward delegation.
 *
 * NEVER bypass this helper when writing a phase output row. Drift
 * between phaseNumber values across the codebase would defeat the
 * purpose of the metadata.
 */

/**
 * NeuraLaunch phase numbering.
 *
 * Discovery and the synthesis call that produces the Recommendation
 * are intentionally fused into Phase 1. The Recommendation row IS
 * the persisted output of phase 1; there is no separate "discovery"
 * phase output that survives a session because the belief state is
 * already on DiscoverySession. Splitting them would force the
 * orchestration layer to know that a phase 3 signal should skip
 * phase 2 and reach all the way back to phase 1.
 */
export const PHASES = {
  RECOMMENDATION:    1, // Discovery + synthesis -> Recommendation
  ROADMAP:           2, // Roadmap engine        -> Roadmap
  VALIDATION:        3, // Validation page + report
  MARKETING_SITE:    4, // Future
  MVP_BUILD:         5, // Future
} as const;

export const TOTAL_PHASES = 5 as const;

export type PhaseNumber = typeof PHASES[keyof typeof PHASES];

/**
 * The shape persisted to every phase output row's phaseContext column.
 * upstream IDs are nullable individually because not every phase has
 * a roadmap or validation page upstream of it.
 */
export interface PhaseContext {
  phaseNumber:  PhaseNumber;
  totalPhases:  typeof TOTAL_PHASES;
  upstream: {
    discoverySessionId?: string;
    recommendationId?:   string;
    roadmapId?:          string;
    validationPageId?:   string;
  };
}

/**
 * Build a PhaseContext for the given phase. Pass the upstream IDs
 * that this row depended on; the helper drops undefined values so
 * the JSONB column stays minimal.
 */
export function buildPhaseContext(
  phaseNumber: PhaseNumber,
  upstream:    PhaseContext['upstream'],
): PhaseContext {
  const cleaned: PhaseContext['upstream'] = {};
  if (upstream.discoverySessionId) cleaned.discoverySessionId = upstream.discoverySessionId;
  if (upstream.recommendationId)   cleaned.recommendationId   = upstream.recommendationId;
  if (upstream.roadmapId)          cleaned.roadmapId          = upstream.roadmapId;
  if (upstream.validationPageId)   cleaned.validationPageId   = upstream.validationPageId;
  return {
    phaseNumber,
    totalPhases: TOTAL_PHASES,
    upstream: cleaned,
  };
}
