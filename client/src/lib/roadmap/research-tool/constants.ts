// src/lib/roadmap/research-tool/constants.ts

/**
 * The internal tool identifier for suggestedTools on roadmap tasks.
 */
export const RESEARCH_TOOL_ID = 'research_tool' as const;

/**
 * The seven types of findings the Research Tool can produce.
 * Each type drives different rendering in the report UI —
 * business/person cards show contact info, competitor cards show
 * pricing/positioning, regulation cards show source documents, etc.
 */
export const FINDING_TYPES = [
  'business',
  'person',
  'competitor',
  'datapoint',
  'regulation',
  'tool',
  'insight',
] as const;
export type FindingType = typeof FINDING_TYPES[number];

/**
 * Confidence level on each finding. Drives the badge colour in
 * the report UI and tells the founder how much to trust it.
 */
export const CONFIDENCE_LEVELS = ['verified', 'likely', 'unverified'] as const;
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];

/**
 * Step budget for the initial research execution. The largest in
 * the system — simple queries use 5-8 steps, complex queries
 * use 15-25.
 */
export const RESEARCH_EXECUTION_STEPS = 25;

/**
 * Step budget for follow-up rounds. Targeted queries, not full
 * research sweeps.
 */
export const RESEARCH_FOLLOWUP_STEPS = 10;

/**
 * Maximum follow-up rounds per research session. After 5, the
 * founder starts a new session.
 */
export const FOLLOWUP_MAX_ROUNDS = 5;
