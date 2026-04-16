// src/lib/roadmap/roadmap-schema.ts
//
// The roadmap schemas live in the @neuralaunch/api-types workspace
// package — re-exported here so existing client imports
// (`import { RoadmapSchema } from '@/lib/roadmap/roadmap-schema'`)
// continue to work unchanged. New code should import directly from
// @neuralaunch/api-types.

export {
  RoadmapTaskSchema,
  RoadmapPhaseSchema,
  RoadmapSchema,
  type RoadmapTask,
  type RoadmapPhase,
  type Roadmap,
} from '@neuralaunch/api-types';
