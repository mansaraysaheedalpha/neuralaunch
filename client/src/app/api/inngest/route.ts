// src/app/api/inngest/route.ts
import { serve }   from 'inngest/next';
import { inngest } from '@/inngest/client';
import {
  discoverySessionFunction,
  roadmapGenerationFunction,
  validationReportingFunction,
  validationReportingSchedulerFunction,
  validationLifecycleFunction,
  pushbackAlternativeFunction,
  roadmapNudgeFunction,
  continuationBriefFunction,
  lifecycleTransitionFunction,
  transformationReportFunction,
  usageAnomalyDetectionFunction,
  paddleReconciliationFunction,
  backfillRoadmapTaskIdsFunction,
  researchExecuteJobFunction,
  researchFollowupJobFunction,
  packagerGenerateJobFunction,
  packagerAdjustJobFunction,
  composerGenerateJobFunction,
  coachPrepareJobFunction,
} from '@/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    discoverySessionFunction,
    roadmapGenerationFunction,
    validationReportingSchedulerFunction,
    validationReportingFunction,
    validationLifecycleFunction,
    pushbackAlternativeFunction,
    roadmapNudgeFunction,
    continuationBriefFunction,
    lifecycleTransitionFunction,
    transformationReportFunction,
    usageAnomalyDetectionFunction,
    paddleReconciliationFunction,
    backfillRoadmapTaskIdsFunction,
    researchExecuteJobFunction,
    researchFollowupJobFunction,
    packagerGenerateJobFunction,
    packagerAdjustJobFunction,
    composerGenerateJobFunction,
    coachPrepareJobFunction,
  ],
});
