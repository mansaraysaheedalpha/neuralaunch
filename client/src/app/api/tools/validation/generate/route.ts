// src/app/api/tools/validation/generate/route.ts
//
// Truly-standalone validation-page creation — no recommendation, no
// task binding. The /tools/validation standalone page calls this
// when the user hasn't selected a recommendation to tie against.
//
// Stores the resulting ValidationPage with recommendationId=NULL,
// roadmapId=NULL, taskId=NULL. The ValidationPage.roadmapId +
// recommendationId columns were made optional in the Step 2 schema
// migration so this shape is valid. The continuation-brief loader
// will not find these pages via venture joins (correct — standalone
// validation is user-scoped, not venture-scoped).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { generateValidationPage } from '@/lib/validation/page-generator';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';
import type { AudienceType } from '@/lib/discovery/constants';
import type { Roadmap } from '@/lib/roadmap/roadmap-schema';
import { buildPhaseContext, PHASES } from '@/lib/phase-context';

const BodySchema = z.object({
  /**
   * What the user wants to validate. Free text — threaded into the
   * page prompt as the primary steering signal since there is no
   * recommendation or task context to derive from.
   */
  target: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'standalone-validation-generate', RATE_LIMITS.AI_GENERATION);

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid body — target is required (1-2000 chars)');
    }

    // Truly-standalone = no recommendation, no task. The generator
    // expects a recommendation object and a roadmap object for its
    // feature-card derivation logic. Feed it synthetic minimal
    // values — path + summary from the user's target; empty phases.
    // The taskContext channel carries the real signal.
    const syntheticRecommendation = {
      path:    parsed.data.target.slice(0, 160),
      summary: parsed.data.target,
    };
    const emptyContext  = {} as DiscoveryContext;
    const emptyRoadmap  = { phases: [], closingThought: '' } as Roadmap;
    const audienceType  = null as AudienceType | null;

    const log = logger.child({
      route: 'POST standalone-validation-generate',
      userId,
    });

    log.info('Generating truly-standalone validation page');

    const { content, layoutVariant, slug } = await generateValidationPage(
      {
        recommendation: syntheticRecommendation,
        context:        emptyContext,
        audienceType,
        roadmap:        emptyRoadmap,
        existingSlug:   undefined,
        sessionId:      `standalone:${userId}:${Date.now()}`,
        taskContext:    parsed.data.target,
      },
      `standalone-${userId}`,
    );

    const phaseContext = toJsonValue(buildPhaseContext(PHASES.VALIDATION, {
      recommendationId:   undefined,
      roadmapId:          undefined,
      discoverySessionId: undefined,
    }));

    const page = await prisma.validationPage.create({
      data: {
        userId,
        recommendationId: null,
        roadmapId:        null,
        taskId:           null,
        slug,
        layoutVariant,
        content:          content as object,
        status:           'DRAFT',
        phaseContext,
      },
      select: { id: true, slug: true, status: true },
    });

    log.info('Standalone validation page saved', { pageId: page.id, slug: page.slug });

    return NextResponse.json({
      pageId: page.id,
      slug:   page.slug,
      status: page.status,
    });
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    logger.error(
      'Standalone validation generate failed',
      err instanceof Error ? err : new Error(String(err)),
    );
    return httpErrorToResponse(err);
  }
}
