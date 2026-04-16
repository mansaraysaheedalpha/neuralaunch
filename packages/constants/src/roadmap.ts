/**
 * Roadmap structural limits — shared between the client (which generates
 * roadmaps and renders them) and the mobile app (which renders them).
 *
 * Engine-only constants like the model IDs (PLANNER / REFINER) and the
 * Inngest event name stay in client/src/lib/roadmap/constants.ts —
 * they have no place in mobile.
 */

/** Maximum phases a roadmap can contain — prevents runaway generation */
export const MAX_ROADMAP_PHASES = 5;

/** Tasks per phase — bounded for focus, not exhaustiveness */
export const MAX_TASKS_PER_PHASE = 5;
