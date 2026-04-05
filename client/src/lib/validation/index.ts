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
