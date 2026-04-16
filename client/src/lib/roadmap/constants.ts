// src/lib/roadmap/constants.ts
//
// MAX_ROADMAP_PHASES and MAX_TASKS_PER_PHASE are shared with mobile
// (which renders roadmaps) and live in @neuralaunch/constants;
// re-exported here so existing imports keep working.
//
// The model IDs (PLANNER / REFINER), the Inngest event name, and the
// WEEKLY_HOURS_MAP stay defined here — they're consumed by the
// roadmap engine and Inngest worker, neither of which run on mobile.

export {
  MAX_ROADMAP_PHASES,
  MAX_TASKS_PER_PHASE,
} from '@neuralaunch/constants';

export const ROADMAP_MODELS = {
  PLANNER:  'claude-sonnet-4-6', // Phase planning and task generation
  REFINER:  'claude-opus-4-6',   // Only used when constraints conflict
} as const;

// Inngest event name
export const ROADMAP_EVENT = 'discovery/roadmap.requested' as const;

// Available-time → weekly hours mapping
// Derived from beliefState.availableTime field values
export const WEEKLY_HOURS_MAP: Record<string, number> = {
  'a few hours a week':  3,
  '1-2 hours a day':     10,
  'half days':           20,
  'full time':           40,
  'all in':              50,
} as const;
