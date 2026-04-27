// Roadmap mock numbers (5 phases / 5 tasks per phase) and the
// continuation brief's 5-section shape are static mirrors of the real
// schemas — see packages/api-types/src/roadmap.ts,
// client/src/lib/roadmap/constants.ts, and
// client/src/lib/continuation/brief-schema.ts. If those shapes drift,
// update the mocks in ./how-it-works/HowItWorksMocks.tsx accordingly.

export { default as TimelineStep } from "./how-it-works/TimelineStep";
export type { TimelineStepProps } from "./how-it-works/TimelineStep";
export {
  ContinuationBriefMock,
  InterviewMock,
  RecommendationPreviewMock,
  RoadmapMock,
  ToolsRowMock,
} from "./how-it-works/HowItWorksMocks";
