// src/inngest/functions/roadmap-generation-function.ts
import { inngest } from '../client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateRoadmap, ROADMAP_EVENT } from '@/lib/roadmap';
import { DiscoveryContextSchema, createEmptyContext } from '@/lib/discovery';
import type { AudienceType } from '@/lib/discovery';
import { RecommendationSchema } from '@/lib/discovery/recommendation-schema';
import { buildPhaseContext, PHASES } from '@/lib/phase-context';

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
    onFailure: async ({ event }) => {
      // onFailure receives a wrapper event; original data is at event.data.event.data
      const { recommendationId } = event.data.event.data as { recommendationId: string; userId: string };
      await prisma.roadmap.updateMany({
        where: { recommendationId, status: 'GENERATING' },
        data:  { status: 'FAILED' },
      });
    },
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
            recommendationType:    true,
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
                audienceType: true,
              },
            },
          },
        });

        if (!rec) throw new Error(`Recommendation ${recommendationId} not found`);
        if (rec.userId !== userId) throw new Error('Recommendation ownership mismatch');

        const parsed      = DiscoveryContextSchema.safeParse(rec.session.beliefState);
        const ctx         = parsed.success ? parsed.data : createEmptyContext();
        const audType     = (rec.session.audienceType ?? null) as AudienceType | null;

        // Validate the recommendation row through the canonical schema
        // before handing it to the synthesis pipeline. The Prisma row
        // has unknown[] for the JSONB columns; the Zod parse coerces
        // them into typed Recommendation arrays AND surfaces any drift
        // (corrupt row, schema change) as a failure of this step.
        const recommendation = RecommendationSchema.parse({
          recommendationType:     rec.recommendationType ?? 'other',
          summary:                rec.summary,
          path:                   rec.path,
          reasoning:              rec.reasoning,
          firstThreeSteps:        rec.firstThreeSteps,
          timeToFirstResult:      rec.timeToFirstResult,
          risks:                  rec.risks,
          assumptions:            rec.assumptions,
          whatWouldMakeThisWrong: rec.whatWouldMakeThisWrong,
          alternativeRejected:    rec.alternativeRejected,
        });

        return {
          recommendation,
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
          // Concern 3 — preparatory metadata. No behaviour today.
          phaseContext: toJsonValue(buildPhaseContext(PHASES.ROADMAP, {
            recommendationId,
            discoverySessionId: sessionId,
          })),
        },
      });
      log.debug('Roadmap persisted', { recommendationId, totalWeeks });
    });

    return { recommendationId, status: 'complete', totalWeeks };
  },
);
