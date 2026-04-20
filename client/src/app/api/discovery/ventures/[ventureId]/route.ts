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
import { assertVentureLimitNotReached } from '@/lib/lifecycle';

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
