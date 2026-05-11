// src/lib/ideation/stage2-requirements/constants.ts
//
// Server-only Stage 2 constants. Cross-app value tuples (SKILL_KEYS,
// SKILL_TIERS, GAP_SEVERITIES, STRUCTURAL_BLOCKER_CHOICES, the
// pushback action/mode enums) live in @neuralaunch/constants. This
// file holds thresholds, model identifiers, and runtime-only
// predicates.

import type {
  FinancialGoalShape,
  LifestylePreference,
  SkillTier,
} from '@neuralaunch/constants';

// ---------------------------------------------------------------------------
// Composition + readiness thresholds
// ---------------------------------------------------------------------------

/**
 * Minimum number of calibration-chat turns before the extractor is
 * allowed to flag `readyToCompose: true`. Prevents the agent from
 * collapsing the founder's skill inventory after one rapid-fire chat
 * exchange and missing real probing opportunities.
 */
export const MIN_SKILL_CALIBRATION_TURNS = 2;

/**
 * Cap on the recommendedActions array inside Stage 2's output. Stage 1
 * uses 25; Stage 2 uses the same baseline. FIFO eviction protects
 * completed entries, same as Stage 1.
 */
export const MAX_RECOMMENDED_ACTIONS_STAGE2 = 25;

/**
 * Number of structural-or-blind-spot constraints on critical Expected
 * Profile entries above which the structural-blocker soft warning
 * trips. The warning is a prompt, not a hard gate — the founder can
 * still push back and commit. Threshold confirmed in plan review;
 * tunable as we see real-session data.
 */
export const STRUCTURAL_BLOCKER_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Expected Profile pushback bounds
// ---------------------------------------------------------------------------

/**
 * Hard cap on per-entry pushback rounds. 5 vs the recommendation
 * pushback's 7 — Expected Profile entries are smaller surfaces than
 * a full recommendation and the founder's escape valves (override,
 * remove, accept) are always one click away.
 */
export const EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND = 5;

/**
 * Round at which the agent should consider injecting a re-frame if
 * the dialogue has stalled (model self-reports `converging: false`).
 * Proportionally lower than the recommendation pushback's round-4
 * soft-warn because the cap itself is lower (5 vs 7).
 */
export const EXPECTED_PROFILE_PUSHBACK_SOFT_WARN_ROUND = 3;

// ---------------------------------------------------------------------------
// Team-need predicates — used by the Stage 2 handler to decide whether
// to ask the targeted team question at composition time.
//
// Per the brief: "If the Stage 1 OutcomeDocument's lifestylePreference
// or financialGoal.shape implies team-need (fundable_startup,
// venture_scale) AND no team has been surfaced by commit time, the
// agent asks ONE targeted question."
// ---------------------------------------------------------------------------

const TEAM_NEEDING_LIFESTYLES: ReadonlyArray<LifestylePreference> = ['fundable_startup'];
const TEAM_NEEDING_FINANCIAL_SHAPES: ReadonlyArray<FinancialGoalShape> = ['venture_scale'];

export function outcomeDemandsTeam(args: {
  lifestylePreference: LifestylePreference | null;
  financialGoalShape:  FinancialGoalShape  | null;
}): boolean {
  if (args.lifestylePreference !== null && TEAM_NEEDING_LIFESTYLES.includes(args.lifestylePreference)) {
    return true;
  }
  if (args.financialGoalShape !== null && TEAM_NEEDING_FINANCIAL_SHAPES.includes(args.financialGoalShape)) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tier ordering — drives the gap-distance computation in constraints.ts.
//
// Ordering matters: 'unknown' is NOT on the tier axis (it represents a
// "we don't know" state, not a quality level). It's handled as the
// special blind_spot severity in constraints.ts.
// ---------------------------------------------------------------------------

export const TIER_ORDER: Record<Exclude<SkillTier, 'unknown'>, number> = {
  good:       3,
  acceptable: 2,
  bad:        1,
};

// ---------------------------------------------------------------------------
// Composition output cap
// ---------------------------------------------------------------------------

/**
 * Max output tokens for the composer's prose-generation pass (the
 * implication strings on each constraint + any final synthesizing
 * text). The structured skeleton (snapshot + expected profile +
 * constraints) is assembled deterministically; this cap only governs
 * the LLM prose pass.
 */
export const REQUIREMENTS_COMPOSITION_MAX_TOKENS = 1500;

/**
 * Max output tokens for the expected-profile-agent's structured
 * derivation pass. The tool-loop budget (research steps) lives in
 * RESEARCH_BUDGETS['stage2-expected-profile'].
 */
export const EXPECTED_PROFILE_MAX_TOKENS = 2000;

/**
 * Max output tokens for each expected-profile-pushback round. The
 * agent produces one structured response per round (action + mode +
 * message) — bounded so degraded providers don't hang.
 */
export const EXPECTED_PROFILE_PUSHBACK_ROUND_MAX_TOKENS = 1500;

// ---------------------------------------------------------------------------
// Model identifiers — Stage 2 reuses the Discovery + Stage 1 chain
// ---------------------------------------------------------------------------

export { MODELS } from '@/lib/discovery/constants';

/**
 * Research-agent key for the Expected Profile derivation tool-loop.
 * Must match the RESEARCH_BUDGETS entry of the same name in
 * src/lib/research/constants.ts and the ResearchAgent type union.
 */
export const EXPECTED_PROFILE_RESEARCH_AGENT_KEY = 'stage2-expected-profile' as const;
