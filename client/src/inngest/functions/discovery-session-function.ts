// src/inngest/functions/discovery-session-function.ts
import { inngest } from '../client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  getSession,
  deleteSession,
  runResearch,
  summariseContext,
  eliminateAlternatives,
  runFinalSynthesis,
} from '@/lib/discovery';

/**
 * discoverySessionFunction
 *
 * Triggered by the turn route when the belief state is ready for synthesis.
 * Runs the 3-step prompt chain (summarise → eliminate → generateObject) and
 * persists the validated Recommendation to the database.
 *
 * Event: discovery/synthesis.requested
 * Data:  { sessionId: string, userId: string }
 */
export const discoverySessionFunction = inngest.createFunction(
  {
    id:       'discovery-synthesis',
    name:     'Discovery — Run Synthesis Chain',
    retries:  2,
    timeouts: { start: '10m' },
    triggers: [{ event: 'discovery/synthesis.requested' }],
  },
  async ({ event, step }) => {
    const { sessionId, userId } = event.data as { sessionId: string; userId: string };

    const log = logger.child({
      inngestFunction: 'discoverySynthesis',
      sessionId,
      userId,
      runId: event.id,
    });

    // Step 1: Load the belief state from Redis
    const interviewState = await step.run('load-belief-state', async () => {
      const state = await getSession(sessionId);
      if (!state) throw new Error(`Session ${sessionId} not found in Redis`);
      if (state.userId !== userId) throw new Error(`Session ownership mismatch`);
      return state;
    });

    // Step 2: Summarise context into a coherent factual brief
    const summary = await step.run('summarise-context', async () => {
      return await summariseContext(interviewState.context);
    });

    // Step 3: Eliminate alternatives and identify the chosen direction.
    // Research runs after this — it targets the specific path chosen, not generic goals.
    const analysis = await step.run('eliminate-alternatives', async () => {
      return await eliminateAlternatives(summary);
    });

    // Step 4: Run targeted research now that the recommended direction is known.
    // The query for the primary path is built from the "strongest fit" conclusion in analysis.
    const researchResult = await step.run('run-research', async () => {
      return await runResearch(
        interviewState.context,
        interviewState.audienceType ?? null,
        sessionId,
        summary,
        analysis,
      );
    });

    // Step 5: Final synthesis — direction + evidence + audience framing
    const recommendation = await step.run('run-final-synthesis', async () => {
      return await runFinalSynthesis(
        summary,
        analysis,
        interviewState.audienceType ?? null,
        researchResult.findings,
      );
    });

    // Step 6: Persist the recommendation to the database
    await step.run('persist-recommendation', async () => {
      await prisma.recommendation.create({
        data: {
          userId,
          sessionId,
          summary:                recommendation.summary,
          path:                   recommendation.path,
          reasoning:              recommendation.reasoning,
          firstThreeSteps:        recommendation.firstThreeSteps,
          timeToFirstResult:      recommendation.timeToFirstResult,
          risks:                  recommendation.risks,
          assumptions:            recommendation.assumptions,
          whatWouldMakeThisWrong: recommendation.whatWouldMakeThisWrong,
          alternativeRejected:    recommendation.alternativeRejected,
        },
      });
      log.debug('Recommendation persisted', { sessionId });
    });

    // Step 7: Clean up Redis — session state is now in DB
    await step.run('cleanup-redis-session', async () => {
      await deleteSession(sessionId);
    });

    log.debug('Synthesis complete', { sessionId });
    return { sessionId, status: 'complete' };
  },
);
