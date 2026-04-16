// src/lib/discovery/recommendation-schema.ts
//
// The Recommendation schema, type, and helper live in the
// @neuralaunch/api-types workspace package — re-exported here so
// existing client imports keep working unchanged. New code should
// import directly from @neuralaunch/api-types.

export {
  RecommendationSchema,
  type Recommendation,
  type AlternativeRejected,
  safeParseAlternatives,
} from '@neuralaunch/api-types';
