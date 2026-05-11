/**
 * Ideation domain constants — shared between client (Stage 1 outcome
 * definition agent, composer, review-mode UI) and mobile (future
 * support for the No Idea archetype).
 *
 * These are the literal value lists every part of the system must
 * agree on for the No Idea archetype's stage ladder. The client Zod
 * schemas in `client/src/lib/ideation/stage1-outcome/schema.ts` wrap
 * these tuples in `z.enum()` to validate LLM output, and the
 * IdeationStageRun.output JSONB blob carries them as plain string
 * literals.
 *
 * Scope: literal values only. No Zod here (constants package has no
 * runtime deps), no types beyond the unions derived from the tuples.
 */

// ---------------------------------------------------------------------------
// Stage 1 — Outcome Definition: the four founder-facing dimensions
// ---------------------------------------------------------------------------

/**
 * Time horizon — the founder's realistic timeline expectation for
 * reaching their stated financial / lifestyle goal. `open` means the
 * founder has no fixed timeline (often a signal worth probing).
 */
export const TIME_HORIZONS = [
  '<6mo',
  '6-18mo',
  '18mo-3yr',
  '3yr+',
  'open',
] as const;
export type TimeHorizon = typeof TIME_HORIZONS[number];

/**
 * Financial goal shape — what kind of revenue / wealth outcome the
 * founder is pursuing. Used downstream by Stages 2..5 to evaluate
 * candidate opportunities against the founder's stated outcome.
 *
 *   - side_income       — supplement existing income, not replace it
 *   - full_replacement  — replace current salary, sustainable solo
 *   - modest_growth     — small business with room to hire 1-3 people
 *   - wealth_creation   — multi-year compounding, eventual exit option
 *   - venture_scale     — VC-track, swing for outsized outcome
 */
export const FINANCIAL_GOAL_SHAPES = [
  'side_income',
  'full_replacement',
  'modest_growth',
  'wealth_creation',
  'venture_scale',
] as const;
export type FinancialGoalShape = typeof FINANCIAL_GOAL_SHAPES[number];

/**
 * Risk tolerance — how much of their existing stability the founder
 * is willing to put on the line. Reality-grounding loop uses this to
 * detect mismatch (e.g. founder says `minimal` but financial goal is
 * `venture_scale` — that's a recommend-an-action moment).
 *
 *   - minimal   — must keep day job, can't risk savings
 *   - moderate  — can dip into savings, day job still on
 *   - high      — willing to quit day job for the right idea
 *   - all_in    — already quit, runway burning
 */
export const RISK_TOLERANCES = [
  'minimal',
  'moderate',
  'high',
  'all_in',
] as const;
export type RiskTolerance = typeof RISK_TOLERANCES[number];

/**
 * Lifestyle preference — the kind of operation the founder actually
 * wants to be running day-to-day, not just the financial outcome.
 *
 *   - side_hustle         — evenings + weekends, kept small on purpose
 *   - full_time_founder   — sole job, growth-oriented
 *   - lifestyle_business  — full-time but capped to remain solo/small
 *   - fundable_startup    — fundraising track, scale-out expected
 *   - contract_freelance  — selling time, not building leveraged IP
 */
export const LIFESTYLE_PREFERENCES = [
  'side_hustle',
  'full_time_founder',
  'lifestyle_business',
  'fundable_startup',
  'contract_freelance',
] as const;
export type LifestylePreference = typeof LIFESTYLE_PREFERENCES[number];

// ---------------------------------------------------------------------------
// Recommended actions — the reality-grounding loop appends entries to
// IdeationStageRun.output.recommendedActions as the conversation progresses.
// ---------------------------------------------------------------------------

/**
 * Severity of an action the agent recommends the founder take in the
 * real world during Stage 1 (e.g. "talk to 3 people in the market you
 * named", "spend a weekend reading X before continuing").
 *
 *   - suggested        — would help, not blocking
 *   - strongly_advised — agent thinks the outcome will be hollow
 *                        without it; UI surfaces it more prominently
 */
export const RECOMMENDED_ACTION_SEVERITIES = [
  'suggested',
  'strongly_advised',
] as const;
export type RecommendedActionSeverity = typeof RECOMMENDED_ACTION_SEVERITIES[number];

/**
 * Founder's relationship with a recommended action over time.
 *
 *   - pending      — recommended, founder hasn't said anything about it
 *   - completed    — founder reports doing it
 *   - pushed_back  — founder explicitly disagrees / declines
 */
export const RECOMMENDED_ACTION_STATUSES = [
  'pending',
  'completed',
  'pushed_back',
] as const;
export type RecommendedActionStatus = typeof RECOMMENDED_ACTION_STATUSES[number];

// ---------------------------------------------------------------------------
// IdeationStageRun status — discriminator for the output JSONB blob
// ---------------------------------------------------------------------------

/**
 * Lifecycle of one stage row. See the IdeationStageRun docstring in
 * schema.prisma for the per-status shape of `output` and the edit /
 * discard transitions.
 *
 *   - authoring     — accumulating turn-by-turn state
 *   - output_ready  — composer has produced a final document
 *   - committed     — founder has frozen it; downstream stages can read
 */
export const IDEATION_STAGE_STATUSES = [
  'authoring',
  'output_ready',
  'committed',
] as const;
export type IdeationStageStatus = typeof IDEATION_STAGE_STATUSES[number];

// ---------------------------------------------------------------------------
// Stage 2 — Outcome Requirements: the 14 skills, tier vocabulary,
// constraint severities, and founder choices.
// ---------------------------------------------------------------------------

/**
 * The 14 skills the founder + each teammate are tier-rated against.
 *
 * Troy's 11 (founder-development canon):
 *   sales, graphic_design, product_design, content_creative,
 *   marketing, public_speaking, technical_literacy, programming,
 *   finance, operational_efficiency, leadership.
 *
 * Late-2026 additions, justified by current-era distribution shape:
 *   ai_literacy                       — fluency with AI tooling has
 *                                       become foundational across
 *                                       almost every modern outcome.
 *   data_analysis                     — distinct from technical_literacy:
 *                                       reading and reasoning about
 *                                       numbers, not just systems.
 *   distribution_community_building   — "build it and they will come"
 *                                       failed; community + distribution
 *                                       is its own discipline.
 */
export const SKILL_KEYS = [
  'sales',
  'graphic_design',
  'product_design',
  'content_creative',
  'marketing',
  'public_speaking',
  'technical_literacy',
  'programming',
  'finance',
  'operational_efficiency',
  'leadership',
  'ai_literacy',
  'data_analysis',
  'distribution_community_building',
] as const;
export type SkillKey = typeof SKILL_KEYS[number];

/**
 * Tier vocabulary. Troy's exact three-tier conversational vocabulary
 * (Good / Acceptable / Bad) plus a fourth data-model state:
 *
 *   - good         — the founder is competitive at this skill
 *   - acceptable   — the founder can do it but it's not a strength
 *   - bad          — the founder is weak here; counts against fit
 *   - unknown      — the founder has explicitly disclaimed knowing
 *                    their level (NOT "not yet asked"). Drives the
 *                    blind-spot constraint when the Expected Profile
 *                    requires this skill: the gap is structurally
 *                    worse than a known weakness because the founder
 *                    cannot self-assess.
 *
 * Conversational framing in the Stage 2 agent stays 3-tier — the
 * agent talks about good / acceptable / bad and only routes a chip
 * to `unknown` when the founder uses "I don't know" / "haven't really
 * tried this" / "never had to" cues.
 */
export const SKILL_TIERS = [
  'good',
  'acceptable',
  'bad',
  'unknown',
] as const;
export type SkillTier = typeof SKILL_TIERS[number];

/**
 * Constraint severity. Derived deterministically by
 * computeConstraints(inventory, expected):
 *
 *   - mild        — 1 tier below the expected requirement
 *                   (e.g. required 'good', strongest-across-team 'acceptable')
 *   - structural  — 2 tiers below
 *                   (required 'good', strongest 'bad')
 *   - blind_spot  — the strongest-across-team tier is 'unknown' on
 *                   a required skill. Treated as structural for the
 *                   blocker threshold; surfaced separately in the UI
 *                   because the remediation is different ("find out
 *                   if you have this" not "improve / hire for this").
 */
export const GAP_SEVERITIES = [
  'mild',
  'structural',
  'blind_spot',
] as const;
export type GapSeverity = typeof GAP_SEVERITIES[number];

/**
 * Founder's choice when the structural-blocker threshold trips
 * (≥ N structural-or-blind-spot constraints on critical Expected
 * Profile entries). Recorded on the artifact; the choice itself is
 * not acted on inside Stage 2 — what happens next is a Stage 3+
 * concern.
 *
 *   - revisit_outcome              — go back to Stage 1 (Stage 3+ wires)
 *   - plan_team_recruit            — keep the outcome, plan to fill
 *                                    gaps with a co-founder
 *   - pushed_back_and_committed    — founder disagrees with the
 *                                    derivation and commits anyway
 *   - not_yet_chosen               — initial state before the founder
 *                                    encounters the soft-warning card
 */
export const STRUCTURAL_BLOCKER_CHOICES = [
  'revisit_outcome',
  'plan_team_recruit',
  'pushed_back_and_committed',
  'not_yet_chosen',
] as const;
export type StructuralBlockerChoice = typeof STRUCTURAL_BLOCKER_CHOICES[number];

// ---------------------------------------------------------------------------
// Expected Profile pushback — multi-round adversarial flow on a
// single ExpectedProfileEntry. Mirrors the engine pattern from
// lib/discovery/pushback-engine.ts (action enum + mode classifier)
// but scoped per-entry, capped at 5 rounds, and without the round-7
// alternative-synthesis branch.
// ---------------------------------------------------------------------------

/** Per-round structured action the agent chooses. */
export const EXPECTED_PROFILE_PUSHBACK_ACTIONS = [
  'continue_dialogue',
  'defend',
  'refine',
  'replace',
  'closing',
] as const;
export type ExpectedProfilePushbackAction = typeof EXPECTED_PROFILE_PUSHBACK_ACTIONS[number];

/**
 * The agent's read of the founder's emotional / argumentative shape.
 * Same three modes the recommendation pushback engine uses —
 * founders question Expected Profile entries with the same emotional
 * shapes.
 */
export const EXPECTED_PROFILE_PUSHBACK_MODES = [
  'analytical',
  'fear',
  'lack_of_belief',
] as const;
export type ExpectedProfilePushbackMode = typeof EXPECTED_PROFILE_PUSHBACK_MODES[number];
