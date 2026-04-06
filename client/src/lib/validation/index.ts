// src/lib/validation/index.ts
// Public API for the Phase 3 validation engine module.

export {
  VALIDATION_SYNTHESIS_THRESHOLDS,
  DISTRIBUTION_BRIEF_CONFIG,
  VALIDATION_PAGE_CONFIG,
  VALIDATION_REPORTING_EVENT,
  VALIDATION_LIFECYCLE_EVENT,
  LAYOUT_VARIANTS,
} from './constants';

export type { LayoutVariant } from './constants';

export {
  ValidationPageContentSchema,
  DistributionBriefSchema,
  DistributionChannelSchema,
  ValidationInterpretationSchema,
  ValidationReportSchema,
  FeatureCardSchema,
} from './schemas';

export { generateValidationPage, generateSlug, selectLayoutVariant } from './page-generator';
export type { PageGenerationInput, PageGenerationResult }             from './page-generator';

export { generateDistributionBrief }  from './distribution-generator';
export { interpretValidationMetrics } from './interpreter';
export type { InterpretInput }         from './interpreter';
export {
  canGenerateBuildBrief,
  generateBuildBrief,
} from './build-brief-generator';
export type {
  BuildBriefInput,
  ThresholdGateResult,
} from './build-brief-generator';
export { collectMetricsForPage }       from './metrics-collector';
export type { RawMetrics }             from './metrics-collector';

export type {
  ValidationPageContent,
  DistributionBrief,
  DistributionChannel,
  ValidationInterpretation,
  ValidationReport,
  ConfirmedFeature,
  RejectedFeature,
  FeatureCard,
  FeatureClickData,
  SurveyResponse,
} from './schemas';
