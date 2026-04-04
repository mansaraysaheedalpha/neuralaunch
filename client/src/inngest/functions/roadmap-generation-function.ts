// src/inngest/functions/roadmap-generation-function.ts
import { inngest } from '../client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateRoadmap, ROADMAP_EVENT } from '@/lib/roadmap';
import { DiscoveryContextSchema, createEmptyContext } from '@/lib/discovery';
import type { AudienceType } from '@/lib/discovery';
import type { Recommendation } from '@/lib/discovery/recommendation-schema';

/**
 * roadmapGenerationFunction
 *
 * Triggered when a user requests an execution roadmap for a completed recommendation.
 * Loads the Recommendation + beliefState from the linked DiscoverySession, generates
 * a phased plan via the roadmap engine, and persists it as a Roadmap record.
 *
 * Event: discovery/roadmap.requested
 * Data:  { recommendationId: string, userId: string }
 */
export const roadmapGenerationFunction = inngest.createFunction(
  {
    id:       'discovery-roadmap-generation',
    name:     'Discovery — Generate Execution Roadmap',
    retries:  2,
    timeouts: { start: '5m' },
    triggers: [{ event: ROADMAP_EVENT }],
  },
  async ({ event, step }) => {
    const { recommendationId, userId } = event.data as {
      recommendationId: string;
      userId:           string;
    };

    const log = logger.child({
      inngestFunction: 'roadmapGeneration',
      recommendationId,
      userId,
      runId: event.id,
    });

    // Step 1: Load recommendation + linked belief state
    const { recommendation, context, audienceType, sessionId } = await step.run(
      'load-recommendation',
      async () => {
        const rec = await prisma.recommendation.findUnique({
          where:  { id: recommendationId },
          select: {
            id:                    true,
            userId:                true,
            sessionId:             true,
            summary:               true,
            path:                  true,
            reasoning:             true,
            firstThreeSteps:       true,
            timeToFirstResult:     true,
            risks:                 true,
            assumptions:           true,
            whatWouldMakeThisWrong: true,
            alternativeRejected:   true,
            session: {
              select: {
                beliefState:  true,
                activeField:  true,
              },
            },
          },
        });

        if (!rec) throw new Error(`Recommendation ${recommendationId} not found`);
        if (rec.userId !== userId) throw new Error('Recommendation ownership mismatch');

        const parsed      = DiscoveryContextSchema.safeParse(rec.session.beliefState);
        const ctx         = parsed.success ? parsed.data : createEmptyContext();
        const audType     = (rec.session.activeField ?? null) as AudienceType | null;

        return {
          recommendation: rec as unknown as Recommendation,
          context:        ctx,
          audienceType:   audType,
          sessionId:      rec.sessionId,
        };
      },
    );

    // Step 2: Create a GENERATING placeholder so the UI can show a loading state
    await step.run('create-roadmap-placeholder', async () => {
      await prisma.roadmap.upsert({
        where:  { recommendationId },
        create: {
          userId,
          recommendationId,
          status: 'GENERATING',
          phases: [],
        },
        update: { status: 'GENERATING', phases: [] },
      });
    });

    // Step 3: Generate the roadmap
    const { roadmap, weeklyHours, totalWeeks } = await step.run(
      'generate-roadmap',
      async () => generateRoadmap(recommendation, context, audienceType, sessionId),
    );

    // Step 4: Persist the completed roadmap
    await step.run('persist-roadmap', async () => {
      await prisma.roadmap.update({
        where: { recommendationId },
        data: {
          status:         'READY',
          phases:         roadmap.phases as object[],
          closingThought: roadmap.closingThought,
          weeklyHours,
          totalWeeks,
        },
      });
      log.debug('Roadmap persisted', { recommendationId, totalWeeks });
    });

    return { recommendationId, status: 'complete', totalWeeks };
  },
);
