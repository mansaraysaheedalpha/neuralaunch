// src/lib/roadmap/index.ts
// Public API for the roadmap module.

export type { Roadmap, RoadmapPhase, RoadmapTask } from './roadmap-schema';
export { RoadmapSchema, RoadmapPhaseSchema, RoadmapTaskSchema } from './roadmap-schema';

export { generateRoadmap } from './roadmap-engine';

export {
  ROADMAP_MODELS,
  ROADMAP_EVENT,
  MAX_ROADMAP_PHASES,
  MAX_TASKS_PER_PHASE,
  WEEKLY_HOURS_MAP,
} from './constants';
