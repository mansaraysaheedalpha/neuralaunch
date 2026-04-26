// src/lib/transformation/index.ts
//
// Public API for the Transformation Report module. Mirrors the
// continuation/lifecycle barrel pattern — re-exports every symbol
// callers outside the module should reach for. Internal files
// remain implementation detail.

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
  RedactionCandidateSchema,
  RedactionCandidatesArraySchema,
  REDACTION_TYPES,
  safeParseTransformationReport,
  type TransformationReport,
  type TransformationCustomSection,
  type TransformationDecisivePivot,
  type DefaultSectionKey,
  type RedactionCandidate,
  type RedactionType,
} from './schemas';

export {
  updateTransformationStage,
  completeTransformationReport,
  failTransformationReport,
} from './helpers';

export {
  notifyTransformationComplete,
  notifyTransformationFailed,
} from './notifications';

export {
  loadVentureEvidenceBundle,
  type VentureEvidenceBundle,
  type CycleEvidence,
  type CheckInEvidence,
  type ToolSessionEvidence,
  type ParkingLotEvidence,
  type ValidationSignalEvidence,
  type OutcomeEvidence,
} from './evidence-loader';

export { generateTransformationReport } from './engine';
