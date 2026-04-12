// src/lib/continuation/index.ts
//
// Public API for the continuation module. Nothing outside this
// directory should import from internal files directly — the barrel
// is the contract surface.

export {
  CONTINUATION_BRIEF_EVENT,
  CONTINUATION_THRESHOLDS,
  CONTINUATION_STATUSES,
  PARKING_LOT_MAX_ITEMS,
  PARKING_LOT_IDEA_MAX_LENGTH,
  DIAGNOSTIC_HARD_CAP_TURNS,
  DIAGNOSTIC_WARNING_TURN,
} from './constants';
export type { ContinuationStatus } from './constants';

export type {
  ParkingLotItem,
  ParkingLot,
  ParkingLotSource,
  AppendOutcome,
} from './parking-lot-schema';
export {
  PARKING_LOT_SOURCES,
  ParkingLotItemSchema,
  ParkingLotArraySchema,
  safeParseParkingLot,
  buildParkingLotItem,
  appendParkingLotItem,
  captureParkingLotFromCheckin,
} from './parking-lot-schema';

export type {
  ContinuationBrief,
  ContinuationFork,
  ParkingLotBriefEntry,
} from './brief-schema';
export {
  ContinuationBriefSchema,
  ContinuationForkSchema,
  safeParseContinuationBrief,
} from './brief-schema';

export type {
  DiagnosticVerdict,
  DiagnosticTurn,
  DiagnosticHistory,
  DiagnosticHistoryEntry,
} from './diagnostic-schema';
export {
  DIAGNOSTIC_VERDICTS,
  INCONCLUSIVE_RESOLUTION_OPTIONS,
  DiagnosticTurnSchema,
  DiagnosticHistoryEntrySchema,
  DiagnosticHistoryArraySchema,
  safeParseDiagnosticHistory,
} from './diagnostic-schema';

export type { CheckpointScenario, ScenarioEvaluation } from './scenario-evaluator';
export { evaluateScenario } from './scenario-evaluator';

export type { ExecutionMetrics } from './speed-calibration';
export { computeExecutionMetrics } from './speed-calibration';

export type { RunDiagnosticTurnInput } from './diagnostic-engine';
export { runDiagnosticTurn } from './diagnostic-engine';

export type { GenerateBriefInput } from './brief-generator';
export { generateContinuationBrief } from './brief-generator';

export type {
  ContinuationEvidence,
  LoadEvidenceResult,
  CheckpointStatus,
  LoadCheckpointResult,
} from './evidence-loader';
export { loadContinuationEvidence, loadCheckpointStatus } from './evidence-loader';

export {
  buildDiagnosticTurnPair,
  nextStatusForVerdict,
} from './diagnostic-orchestration';

export type { ForkRecommendationPayload } from './fork-to-recommendation';
export {
  buildForkRecommendationPayload,
  persistForkRecommendation,
} from './fork-to-recommendation';
