// src/components/institute/tools/research/index.ts
//
// Public barrel for the Research tool interior. The /tools/research
// page composes these to fill the <ToolShell>'s body; the older
// card-based renderer was deleted in PR 15-Research.

export { ResearchComposer }   from './ResearchComposer';
export type { ResearchComposerProps } from './ResearchComposer';

export { StepTrail }          from './StepTrail';
export type { StepTrailProps } from './StepTrail';

export { PlanReview }         from './PlanReview';
export type { PlanReviewProps } from './PlanReview';

export { FindingsLedger, InFlightHero } from './FindingsLedger';
export type { FindingsLedgerProps, InFlightHeroProps } from './FindingsLedger';

export { FindingRow }         from './FindingRow';
export type { FindingRowProps } from './FindingRow';

export { ConfidenceStamp }    from './ConfidenceStamp';
export type { ConfidenceStampProps } from './ConfidenceStamp';

export { ConfidenceSummary }  from './ConfidenceSummary';
export type { ConfidenceSummaryProps } from './ConfidenceSummary';

export { FollowUpComposer }   from './FollowUpComposer';
export type { FollowUpComposerProps } from './FollowUpComposer';
