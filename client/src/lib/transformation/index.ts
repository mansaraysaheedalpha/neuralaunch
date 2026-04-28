// src/lib/transformation/index.ts
//
// Public barrel for Transformation Report TYPES + SCHEMAS +
// CONSTANTS only. Safe to import from client components.
//
// Server-only modules (engine.ts, evidence-loader.ts, helpers.ts,
// notifications.ts, redaction.ts) intentionally do NOT live in
// this barrel — re-exporting them here would pull
// `import 'server-only'` into the client bundle every time a UI
// component touched a transformation type or schema. Server
// consumers import directly from their respective files:
//
//   import { generateTransformationReport, detectRedactionCandidates }
//     from '@/lib/transformation/engine';
//   import { loadVentureEvidenceBundle, type VentureEvidenceBundle }
//     from '@/lib/transformation/evidence-loader';
//   import { updateTransformationStage, completeTransformationReport,
//            failTransformationReport }
//     from '@/lib/transformation/helpers';
//   import { notifyTransformationComplete, notifyTransformationFailed }
//     from '@/lib/transformation/notifications';
//   import { autoRedactReport, autoRedactString, applyRedactionEdits }
//     from '@/lib/transformation/redaction';

export {
  TRANSFORMATION_REPORT_EVENT,
  REOPEN_WINDOW_MS,
  TRANSFORMATION_STAGES,
  TRANSFORMATION_PUBLISH_STATES,
  isWithinReopenWindow,
  type TransformationStage,
  type TransformationPublishState,
} from './constants';

export {
  DEFAULT_SECTION_KEYS,
  TransformationReportSchema,
  TransformationCustomSectionSchema,
  TransformationDecisivePivotSchema,
  TransformationCardSummarySchema,
  RedactionCandidateSchema,
  RedactionCandidatesArraySchema,
  RedactionEditEntrySchema,
  RedactionEditsSchema,
  OUTCOME_LABELS,
  REDACTION_TYPES,
  safeParseTransformationReport,
  safeParseCardSummary,
  type TransformationReport,
  type TransformationCustomSection,
  type TransformationDecisivePivot,
  type TransformationCardSummary,
  type DefaultSectionKey,
  type OutcomeLabel,
  type RedactionCandidate,
  type RedactionEditEntry,
  type RedactionEdits,
  type RedactionType,
} from './schemas';

export { deriveCardSummary } from './card-summary';
