// src/app/api/inngest/route.ts
import { serve }   from 'inngest/next';
import { inngest } from '@/inngest/client';
import {
  discoverySessionFunction,
  roadmapGenerationFunction,
  validationReportingFunction,
  validationLifecycleFunction,
} from '@/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    discoverySessionFunction,
    roadmapGenerationFunction,
    validationReportingFunction,
    validationLifecycleFunction,
  ],
  // signingKey is read automatically from INNGEST_SIGNING_KEY env var in v4
});
