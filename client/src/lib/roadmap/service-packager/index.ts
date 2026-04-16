// src/lib/roadmap/service-packager/index.ts
//
// Public API for the Service Packager module.

export {
  PACKAGER_TOOL_ID,
  PACKAGER_BRIEF_FORMATS,
  MAX_ADJUSTMENT_ROUNDS,
  CONTEXT_MAX_EXCHANGES,
  type PackagerBriefFormat,
} from './constants';

export {
  ServiceContextSchema,
  ServicePackageSchema,
  PackagerAdjustmentSchema,
  PackagerSessionSchema,
  safeParsePackagerSession,
  type ServiceContext,
  type ServicePackage,
  type PackagerAdjustment,
  type PackagerSession,
} from './schemas';

export {
  runPackagerContext,
  type RunPackagerContextInput,
  type ContextResponse,
} from './context-engine';

export {
  runPackagerGeneration,
  type RunPackagerGenerationInput,
} from './generation-engine';

export {
  runPackagerAdjustment,
  type RunPackagerAdjustmentInput,
} from './adjustment-engine';

export {
  digestResearchSessionForPackager,
  buildPrePopulatedContextFromTask,
  buildPrePopulatedContextStandalone,
} from './context-helpers';
