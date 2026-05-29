// src/components/institute/recommendation/index.ts
//
// Public barrel for the Institute recommendation primitives. The
// recommendation page composes these; a future /ventures re-read view
// can reuse the same set with persisted (rather than live-streamed)
// delta + read-only pushback.

export { RecSection } from './RecSection';
export type { RecSectionProps } from './RecSection';

export { RecommendationReveal } from './RecommendationReveal';
export type { RecommendationRevealProps } from './RecommendationReveal';

export { RecReasoning } from './RecReasoning';
export { RecSteps } from './RecSteps';
export { RecTimeToResult } from './RecTimeToResult';
export { RecRisks } from './RecRisks';
export type { RecRisk } from './RecRisks';
export { RecWrong } from './RecWrong';
export { RecAlternatives } from './RecAlternatives';
export type { RecAlternative } from './RecAlternatives';

export { RecAssumptions } from './RecAssumptions';
export type { RecAssumptionsProps } from './RecAssumptions';
export { Assumption } from './Assumption';
export type { AssumptionProps } from './Assumption';

export { AcceptBar } from './AcceptBar';
export type { AcceptBarProps } from './AcceptBar';

export { PushbackRail } from './PushbackRail';
export type { PushbackRailProps, PushbackRailHandle, RailTurn } from './PushbackRail';
