// src/lib/lifecycle/index.ts
//
// Public API for the lifecycle memory module.

export {
  FounderProfileSchema,
  CycleSummarySchema,
  safeParseFounderProfile,
  safeParseCycleSummary,
  type FounderProfile,
  type CycleSummary,
} from './schemas';

export {
  getFounderProfile,
  upsertFounderProfile,
} from './profile';

export {
  getActiveVentures,
  getCurrentCycle,
  createVenture,
  createCycle,
  getAllVentures,
  deriveVentureName,
  bootstrapVentureAndCycleForRecommendation,
  createNextCycleForVenture,
  type Venture,
  type Cycle,
} from './venture';

export {
  assertVentureLimitNotReached,
  assertPausedVentureLimitNotReached,
  assertFreeDiscoverySessionLimit,
  assertVentureWritable,
  countFreeDiscoverySessions,
  getUserTier,
  FREE_DISCOVERY_SESSION_LIMIT,
} from './tier-limits';

export {
  renderFounderProfileBlock,
  renderCycleSummariesBlock,
  renderCrossVentureBlock,
  renderInterviewOpeningBlock,
} from './prompt-renderers';

export {
  loadInterviewContext,
  loadRecommendationContext,
  loadRoadmapContext,
  loadPerTaskAgentContext,
  loadContinuationBriefContext,
  loadCycleSummaryGeneratorContext,
  loadCrossVentureSummaries,
  CROSS_VENTURE_CYCLE_LIMIT,
  type InterviewContext,
  type RecommendationContext,
  type RoadmapContext,
  type PerTaskAgentContext,
  type ContinuationBriefContext,
  type CycleSummaryGeneratorContext,
  type CrossVentureCycleEntry,
} from './context-loaders';
