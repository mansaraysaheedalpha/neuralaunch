// src/app/api/discovery/ventures/[ventureId]/route.ts
//
// PATCH — mutate venture metadata. Two orthogonal payloads:
//   - { name: string }    → rename
//   - { status: 'active' | 'paused' | 'completed' }
//                          → lifecycle transition (pause / resume / complete)
// Both validated, both ownership-scoped via findFirst({ id, userId }).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  assertVentureLimitNotReached,
  assertPausedVentureLimitNotReached,
} from '@/lib/lifecycle';

// Request-body schema accepts any subset of the mutable fields. At
// least one must be present; both are optional so rename-only and
// status-only calls are both valid.
const PatchBodySchema = z
  .object({
    name:   z.string().min(1).max(100).transform(v => v.trim()).optional(),
    status: z.enum(['active', 'paused', 'completed']).optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.status !== undefined,
    { message: 'Body must include name or status' },
  );

/**
 * Transition matrix — which from→to moves are allowed. Archived
 * ventures (set by tier-downgrade plumbing) are NOT modifiable
 * through this endpoint; they must be restored via the explicit
 * unarchive flow first. Completed is terminal — it cannot revert.
 *
 *   active    → paused     ✓  (user pauses to free the slot)
 *   active    → completed  ✓  (user marks the venture done)
 *   paused    → active     ✓  (user resumes; cap is re-checked)
 *   paused    → completed  ✓  (user marks the paused venture done)
 *   completed → anything   ✗  terminal
 *   archived  → anything   ✗  use the unarchive flow
 */
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  active:    ['paused', 'completed'],
  paused:    ['active', 'completed'],
  completed: [],
  archived:  [],
};

/**
 * PATCH /api/discovery/ventures/[ventureId]
 *
 * Accepts { name?, status? }.  Name is trimmed 1-100 chars. Status
 * transitions are bounded by the matrix above; resuming a paused
 * venture re-checks the tier cap (so a user who filled their slots
 * while this one was paused gets a clean 403 with the cap message
 * rather than silently exceeding the limit).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ventureId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'venture-patch', RATE_LIMITS.API_AUTHENTICATED);

    const { ventureId } = await params;

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = PatchBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid body — provide name (1-100 chars) or status (active|paused|completed)');
    }

    const venture = await prisma.venture.findFirst({
      where:  { id: ventureId, userId },
      select: { id: true, status: true, archivedAt: true },
    });
    if (!venture) throw new HttpError(404, 'Not found');

    // Archived ventures cannot be mutated through this endpoint — the
    // existing unarchive flow (POST /archive → swap) handles that case
    // and enforces its own cap semantics.
    if (venture.archivedAt !== null) {
      throw new HttpError(409, 'Archived ventures cannot be edited here — restore the venture first from the archived section.');
    }

    const updateData: { name?: string; status?: 'active' | 'paused' | 'completed' } = {};

    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name;
    }

    if (parsed.data.status !== undefined && parsed.data.status !== venture.status) {
      const allowed = ALLOWED_TRANSITIONS[venture.status] ?? [];
      if (!allowed.includes(parsed.data.status)) {
        throw new HttpError(
          409,
          `Cannot transition a ${venture.status} venture to ${parsed.data.status}.`,
        );
      }

      // Resuming a paused venture consumes an active slot. Re-check
      // the cap before committing so a user who added other active
      // ventures while this one was paused gets the usual cap message
      // instead of silently bypassing the limit.
      if (venture.status === 'paused' && parsed.data.status === 'active') {
        await assertVentureLimitNotReached(userId);
      }

      // Pausing an active venture consumes a paused slot. Without
      // this cap an Execute founder can serially pause ventures and
      // accumulate unlimited non-active ventures, defeating the
      // active-cap entirely. The asserter throws a 403 with a
      // tier-aware message ("you have N of M paused" + upgrade hint
      // on Execute) which the VentureCard surfaces inline.
      if (venture.status === 'active' && parsed.data.status === 'paused') {
        await assertPausedVentureLimitNotReached(userId);
      }

      updateData.status = parsed.data.status;
    }

    const updated = await prisma.venture.update({
      where: { id: ventureId },
      data:  updateData,
      select: { id: true, name: true, status: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

/**
 * DELETE /api/discovery/ventures/[ventureId]
 *
 * Hard-deletes a venture and every artefact under it: cycles, the
 * recommendations attached to those cycles, the roadmaps attached
 * to those recommendations, and the validation pages bound to either
 * roadmap or recommendation. Allowed at any status (active, paused,
 * completed, archived) so the founder can clean up obsolete or test
 * data without first transitioning state.
 *
 * Cascade order matters because the schema mixes Cascade and SetNull:
 *   1. ValidationPage.recommendationId / roadmapId  → SetNull
 *      (must be explicitly deleted; otherwise pages linger as
 *      orphans in /discovery/validation)
 *   2. Recommendation                               → cascades Roadmap
 *      and RoadmapProgress
 *   3. Venture                                      → cascades Cycle
 *
 * The DiscoverySession that produced the recommendation is NOT
 * deleted — discovery sessions are shared across cycles within a
 * venture (the fork flow reuses the parent session id) and the
 * interview transcript is intentionally durable history.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ ventureId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'venture-delete', RATE_LIMITS.API_AUTHENTICATED);

    const { ventureId } = await params;

    const venture = await prisma.venture.findFirst({
      where:  { id: ventureId, userId },
      select: {
        id: true,
        cycles: {
          select: {
            id:             true,
            roadmapId:      true,
            recommendation: { select: { id: true } },
          },
        },
        roadmaps: { select: { id: true } },
      },
    });
    if (!venture) throw new HttpError(404, 'Not found');

    const recommendationIds = venture.cycles
      .map(c => c.recommendation?.id)
      .filter((id): id is string => Boolean(id));

    const roadmapIds = Array.from(new Set([
      ...venture.cycles.map(c => c.roadmapId).filter((id): id is string => Boolean(id)),
      ...venture.roadmaps.map(r => r.id),
    ]));

    await prisma.$transaction(async (tx) => {
      // Step 1 — validation pages first, since their FKs are SetNull
      // not Cascade. Deleting the page cascades its snapshots,
      // reports, and events. Filter ownership-scoped so a malformed
      // input cannot reach into another user's data.
      if (recommendationIds.length > 0 || roadmapIds.length > 0) {
        const orFilters: Array<Record<string, unknown>> = [];
        if (recommendationIds.length > 0) {
          orFilters.push({ recommendationId: { in: recommendationIds } });
        }
        if (roadmapIds.length > 0) {
          orFilters.push({ roadmapId: { in: roadmapIds } });
        }
        if (orFilters.length > 0) {
          await tx.validationPage.deleteMany({
            where: { userId, OR: orFilters },
          });
        }
      }

      // Step 2 — recommendations cascade their roadmaps (and the
      // RoadmapProgress / continuation columns living off Roadmap).
      if (recommendationIds.length > 0) {
        await tx.recommendation.deleteMany({
          where: { id: { in: recommendationIds }, userId },
        });
      }

      // Step 3 — the venture row itself, cascading the cycles.
      await tx.venture.delete({ where: { id: ventureId } });
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
