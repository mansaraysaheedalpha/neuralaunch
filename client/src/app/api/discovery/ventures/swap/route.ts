// src/app/api/discovery/ventures/swap/route.ts
//
// POST /api/discovery/ventures/swap
//
// Mobile-friendly REST counterpart to the `swapVentureStatus` server
// action at client/src/app/actions/ventures.ts. Same transaction
// shape, same cap semantics, same error codes — only the auth path
// differs (Bearer token via requireUserId vs. NextAuth session).
//
// Request body:
//   { ventureIdToActivate: string, ventureIdToArchive?: string }
// Success response (200):
//   { ok: true, activatedName: string, archivedName: string | null }
// Error response (4xx):
//   { ok: false, reason: string, message?: string }

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { TIER_VENTURE_LIMITS, type Tier } from '@/lib/paddle/tiers';

const BodySchema = z.object({
  ventureIdToActivate: z.string().min(1),
  ventureIdToArchive:  z.string().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'venture-swap', RATE_LIMITS.API_AUTHENTICATED);

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');
    const input = parsed.data;

    if (input.ventureIdToActivate === input.ventureIdToArchive) {
      return NextResponse.json({ ok: false, reason: 'same-venture' }, { status: 400 });
    }

    const subscription = await prisma.subscription.findUnique({
      where:  { userId },
      select: { tier: true },
    });
    const tier: Tier =
      subscription?.tier === 'execute' || subscription?.tier === 'compound'
        ? subscription.tier
        : 'free';
    const cap = TIER_VENTURE_LIMITS[tier];

    if (cap <= 0) {
      return NextResponse.json(
        {
          ok: false,
          reason: 'free-tier',
          message: 'Your plan does not include active ventures. Upgrade to Execute or Compound to activate archived ventures.',
        },
        { status: 403 },
      );
    }

    // Atomic cap-check + ownership-check + updates, matching the
    // server action's transaction shape so two clients racing a swap
    // can't double-activate past the cap.
    const result = await prisma.$transaction(async (tx) => {
      const activateTarget = await tx.venture.findFirst({
        where:  { id: input.ventureIdToActivate, userId },
        select: { id: true, name: true, archivedAt: true },
      });
      if (!activateTarget) {
        return { kind: 'error' as const, reason: 'not-found' as const };
      }
      if (!activateTarget.archivedAt) {
        return { kind: 'error' as const, reason: 'activate-not-archived' as const };
      }

      const activeCount = await tx.venture.count({
        where: { userId, status: 'active', archivedAt: null },
      });
      const atCap = activeCount >= cap;

      if (atCap) {
        if (!input.ventureIdToArchive) {
          return { kind: 'error' as const, reason: 'activate-target-required' as const };
        }
        const archiveTarget = await tx.venture.findFirst({
          where:  { id: input.ventureIdToArchive, userId },
          select: { id: true, name: true, archivedAt: true, status: true },
        });
        if (!archiveTarget) {
          return { kind: 'error' as const, reason: 'not-found' as const };
        }
        if (archiveTarget.archivedAt || archiveTarget.status !== 'active') {
          return { kind: 'error' as const, reason: 'archive-not-active' as const };
        }

        await tx.venture.update({
          where: { id: archiveTarget.id },
          data:  { archivedAt: new Date() },
        });
        await tx.venture.update({
          where: { id: activateTarget.id },
          data:  { archivedAt: null },
        });
        return {
          kind: 'ok' as const,
          activatedName: activateTarget.name,
          archivedName:  archiveTarget.name,
        };
      }

      await tx.venture.update({
        where: { id: activateTarget.id },
        data:  { archivedAt: null },
      });
      return {
        kind: 'ok' as const,
        activatedName: activateTarget.name,
        archivedName:  null as string | null,
      };
    });

    if (result.kind === 'error') {
      logger.info('Venture swap refused (mobile REST)', {
        userId,
        reason: result.reason,
        ventureIdToActivate: input.ventureIdToActivate,
        ventureIdToArchive:  input.ventureIdToArchive ?? null,
      });
      const status = result.reason === 'not-found' ? 404 : 400;
      return NextResponse.json({ ok: false, reason: result.reason }, { status });
    }

    logger.info('Venture swap committed (mobile REST)', {
      userId,
      activatedId: input.ventureIdToActivate,
      archivedId:  input.ventureIdToArchive ?? null,
    });

    return NextResponse.json({
      ok: true,
      activatedName: result.activatedName,
      archivedName:  result.archivedName,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
