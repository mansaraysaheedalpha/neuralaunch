// src/lib/roadmap/constants.ts

export const ROADMAP_MODELS = {
  PLANNER:  'claude-sonnet-4-6', // Phase planning and task generation
  REFINER:  'claude-opus-4-6',   // Only used when constraints conflict
} as const;

// Maximum phases a roadmap can contain — prevents runaway generation
export const MAX_ROADMAP_PHASES = 5;

// Tasks per phase — bounded for focus, not exhaustiveness
export const MAX_TASKS_PER_PHASE = 5;

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
