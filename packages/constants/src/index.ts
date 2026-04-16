/**
 * @neuralaunch/constants — shared domain constants.
 *
 * Enum value lists, tier boundaries, and configuration limits that
 * both the client and mobile apps need to agree on. The rule: if
 * mobile ever needs to render, route on, or compare against a value
 * the client also defines, that value moves here.
 *
 * Scope: literal values only. No types beyond enum unions derived
 * from the arrays. No logic, no imports from server code.
 */

// Initial scaffold — real constants land in later commits of the
// monorepo migration. Re-exports added as each domain moves over:
//   - discovery.ts → RECOMMENDATION_TYPES, PUSHBACK_MODES,
//                    PUSHBACK_ACTIONS, PUSHBACK_CONFIG, AUDIENCE_TYPES
//   - roadmap.ts   → TASK_STATUSES, CHECKIN_CATEGORIES,
//                    MAX_ROADMAP_PHASES, MAX_TASKS_PER_PHASE
export {};
