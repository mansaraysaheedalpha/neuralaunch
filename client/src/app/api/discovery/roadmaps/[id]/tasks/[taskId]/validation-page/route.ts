// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/validation-page/route.ts
//
// Task-scoped equivalent of the recommendation-scoped validation-page
// create/fetch routes at /api/discovery/recommendations/[id]/validation-page.
//
// When the roadmap generator binds the validation tool to a task, the
// user launches it from that task card; the flow POSTs here with the
// target description the user typed. We resolve the task by walking
// Roadmap.phases JSON for the matching stable task id (minted by the
// engine — see mintTaskId in roadmap-engine.ts), thread the task's
// title + description into generateValidationPage as task context,
// and persist the ValidationPage with taskId + roadmapId set and
// recommendationId null.
//
// Tier gate: Execute (per the scope modification applied to the
// validation-integration branch — validation repositions to Execute).
// Venture-archive gate: standard assertVentureNotArchivedByRoadmap.

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
import type { DiscoveryContext } from '@/lib/discovery/context-schema';
import type { AudienceType } from '@/lib/discovery/constants';
import type { Roadmap, RoadmapPhase, RoadmapTask } from '@/lib/roadmap/roadmap-schema';
import { buildPhaseContext, PHASES } from '@/lib/phase-context';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';

const BodySchema = z.object({
  /**
   * What the user said they're validating in this specific task. Free
   * text; threaded into the generation prompt as the task's target
   * description so the page speaks to the specific offer, not the
   * generic recommendation.
   */
  target: z.string().min(1).max(2000),
});

interface StoredPhase extends RoadmapPhase {
  tasks: (RoadmapTask & { description: string })[];
}

function findTaskInPhases(phases: unknown, taskId: string): { task: RoadmapTask; phase: number } | null {
  if (!Array.isArray(phases)) return null;
  const arr = phases as StoredPhase[];
  for (const phase of arr) {
    if (!Array.isArray(phase.tasks)) continue;
    const task = phase.tasks.find(t => t.id === taskId);
    if (task) return { task, phase: phase.phase };
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    await rateLimitByUser(userId, 'task-validation-page-generate', RATE_LIMITS.AI_GENERATION);

    const log = logger.child({
      route: 'POST task-scoped validation-page',
      roadmapId,
      taskId,
      userId,
    });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid body — target is required (1-2000 chars)');
    }

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:              true,
        phases:          true,
        status:          true,
        recommendation:  {
          select: {
            id:      true,
            path:    true,
            summary: true,
            session: { select: { id: true, audienceType: true, beliefState: true } },
          },
        },
      },
    });
    if (!roadmap || !roadmap.recommendation) {
      throw new HttpError(404, 'Not found');
    }
    if (roadmap.status !== 'READY') {
      throw new HttpError(409, 'Roadmap must be READY before launching tools from its tasks');
    }

    const taskHit = findTaskInPhases(roadmap.phases, taskId);
    if (!taskHit) {
      // The task id no longer exists in this roadmap (fork regeneration,
      // manual regeneration). Stale reference — reject so the client
      // can route the user to /tools/validation standalone instead.
      throw new HttpError(
        404,
        'That task is no longer part of the roadmap — open Validation from /tools to create a page without a task binding.',
      );
    }
    const { task, phase } = taskHit;

    // One page per (roadmap, task). Existing page for this task means
    // the user should regenerate via the existing page flow, not via
    // this create endpoint.
    const existing = await prisma.validationPage.findFirst({
      where:  { roadmapId, taskId },
      select: { id: true, slug: true, status: true },
    });
    if (existing) {
      return NextResponse.json({
        pageId: existing.id,
        slug:   existing.slug,
        status: existing.status,
        alreadyExists: true,
      });
    }

    const context      = (roadmap.recommendation.session?.beliefState ?? {}) as DiscoveryContext;
    const audienceType = (roadmap.recommendation.session?.audienceType ?? null) as AudienceType | null;
    const fullRoadmap  = { phases: roadmap.phases } as Roadmap;

    log.info('Generating task-bound validation page', {
      phase,
      taskTitle: task.title,
    });

    const { content, layoutVariant, slug } = await generateValidationPage(
      {
        recommendation: {
          path:    roadmap.recommendation.path,
          summary: roadmap.recommendation.summary,
        },
        context,
        audienceType,
        roadmap:      fullRoadmap,
        existingSlug: undefined,
        sessionId:    roadmapId,
        taskTitle:    task.title,
        taskContext:  [task.description, parsed.data.target].filter(Boolean).join('\n\n'),
      },
      `${roadmapId}:${taskId}`,
    );

    const phaseContext = toJsonValue(buildPhaseContext(PHASES.VALIDATION, {
      recommendationId:   roadmap.recommendation.id,
      roadmapId:          roadmap.id,
      discoverySessionId: roadmap.recommendation.session?.id,
    }));

    const page = await prisma.validationPage.create({
      data: {
        userId,
        roadmapId,
        taskId,
        // Truly task-bound — no recommendationId so continuation-brief
        // loader pulls this page via the roadmap join, not the
        // recommendation join (Step 11).
        recommendationId: null,
        slug,
        layoutVariant,
        content:          content as object,
        status:           'DRAFT',
        phaseContext,
      },
      select: { id: true, slug: true, status: true },
    });

    log.info('Task-bound validation page saved', { pageId: page.id, slug: page.slug });

    return NextResponse.json({
      pageId:        page.id,
      slug:          page.slug,
      status:        page.status,
      alreadyExists: false,
    });
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    logger.error(
      'Task-scoped validation-page POST failed',
      err instanceof Error ? err : new Error(String(err)),
    );
    return httpErrorToResponse(err);
  }
}

/**
 * GET /api/discovery/roadmaps/[id]/tasks/[taskId]/validation-page
 *
 * Returns the validation page bound to this (roadmap, task) tuple, or
 * { page: null } when none exists. Also returns null when the task id
 * is no longer present in the roadmap's phases (stale reference after
 * a fork regeneration); the page still exists in the database and is
 * accessible via /tools/validation, but it is no longer task-bound
 * from this roadmap's perspective.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    const { id: roadmapId, taskId } = await params;

    const row = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, phases: true },
    });
    if (!row) throw new HttpError(404, 'Not found');

    const taskHit = findTaskInPhases(row.phases, taskId);
    if (!taskHit) {
      // Stale task reference — fall through with a null page; caller
      // can decide what to render.
      return NextResponse.json({ page: null, taskStale: true });
    }

    const page = await prisma.validationPage.findFirst({
      where:  { roadmapId, taskId },
      select: { id: true, slug: true, status: true },
    });

    return NextResponse.json({ page: page ?? null, taskStale: false });
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    return httpErrorToResponse(err);
  }
}
