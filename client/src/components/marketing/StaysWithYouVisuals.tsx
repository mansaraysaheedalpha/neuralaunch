// Lifecycle event timing and beat copy reflect real product triggers:
// - Recalibration is gated by RECALIBRATION_MIN_COVERAGE = 0.4
//   (packages/constants/src/checkin.ts)
// - Nudges fire at timeEstimate × 1.5, 3-day floor, 7-day cooldown
//   (client/src/inngest/functions/roadmap-nudge-function.ts) — never
//   on a fixed schedule
// - Continuation brief shape is 5 sections
//   (client/src/lib/continuation/brief-schema.ts)

export { VentureLifecycleStrip } from "./stays-with-you/VentureLifecycleStrip";
export {
  CheckInBeatMock,
  ContinuationBeatMock,
  MemoryBeatMock,
  RecalibrationBeatMock,
} from "./stays-with-you/beat-mocks";
