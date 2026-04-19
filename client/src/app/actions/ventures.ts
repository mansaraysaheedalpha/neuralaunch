'use server';

// src/app/actions/ventures.ts
//
// Server actions for the explicit venture-reactivation UI. Users whose
// tier downgraded (or whose cap naturally caps them below their total
// venture count) can swap which venture is currently active without
// losing data on the others.

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { auth } from '@/auth';
import {
  HttpError,
  rateLimitByUser,
} from '@/lib/validation/server-helpers';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { TIER_VENTURE_LIMITS, type Tier } from '@/lib/paddle/tiers';

interface VentureSummary {
  id:         string;
  name:       string;
  archivedAt: string | null;
}

export type SwapResult =
  | { ok: true;  ventures: VentureSummary[]; activatedName: string; archivedName: string | null }
  | { ok: false; reason:
      | 'unauthorised'
      | 'rate-limited'
      | 'not-found'
      | 'activate-not-archived'
      | 'archive-not-active'
      | 'activate-target-required'
      | 'free-tier'
      | 'same-venture';
      message?: string;
    };

interface SwapInput {
  /** Venture that should become active (currently archived). */
  ventureIdToActivate: string;
  /**
   * Venture that should become archived (currently active). Required
   * only when the caller is at their tier cap — the helper returns a
   * specific error when omitted in that case. Ignored when the caller
   * has room.
   */
  ventureIdToArchive?: string;
}

/**
 * Resolve the caller's current tier. Prefers the Subscription row;
 * defaults to 'free'. Kept local to this module so swap-level
 * decisions don't pull in the whole tier-limits barrel.
 */
async function resolveTier(userId: string): Promise<Tier> {
  const sub = await prisma.subscription.findUnique({
    where:  { userId },
    select: { tier: true },
  });
  const tier = sub?.tier ?? 'free';
  if (tier === 'execute' || tier === 'compound' || tier === 'free') return tier;
  return 'free';
}

/**
 * Activate an archived venture, optionally swapping an active one
 * into the archive to stay within tier cap.
 *
 * Behaviour:
 *   - Caller must own both ventures (findFirst ownership scope).
 *   - activate target must currently be archived (archivedAt != null).
 *   - If at cap:
 *       - archive target MUST be provided
 *       - archive target must currently be active (archivedAt == null)
 *       - both updates happen in a single transaction
 *   - If under cap:
 *       - archive target is ignored if provided
 *       - only the activate target is unarchived
 *   - Free tier has cap 0 → every swap from free fails with
 *     `free-tier` since there's no room to activate anything.
 *
 * Rate-limited per user at API_AUTHENTICATED (60/min).
 */
export async function swapVentureStatus(input: SwapInput): Promise<SwapResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: 'unauthorised' };
  }
  const userId = session.user.id;

  if (input.ventureIdToActivate === input.ventureIdToArchive) {
    return { ok: false, reason: 'same-venture' };
  }

  try {
    await rateLimitByUser(userId, 'venture-swap', RATE_LIMITS.API_AUTHENTICATED);
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) {
      return { ok: false, reason: 'rate-limited', message: err.message };
    }
    throw err;
  }

  const tier = await resolveTier(userId);
  const cap  = TIER_VENTURE_LIMITS[tier];

  if (cap <= 0) {
    return {
      ok: false,
      reason: 'free-tier',
      message: 'Your plan does not include active ventures. Upgrade to Execute or Compound to activate archived ventures.',
    };
  }

  // All DB reads + writes happen inside a single transaction so the
  // cap check, ownership checks, and the two updates commit atomically.
  // Concurrent swap calls see a consistent active-count and can't
  // double-activate past the cap.
  try {
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
        if (archiveTarget.archivedAt) {
          return { kind: 'error' as const, reason: 'archive-not-active' as const };
        }
        if (archiveTarget.status !== 'active') {
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

      // Under cap — just unarchive.
      await tx.venture.update({
        where: { id: activateTarget.id },
        data:  { archivedAt: null },
      });
      return {
        kind: 'ok' as const,
        activatedName: activateTarget.name,
        archivedName:  null,
      };
    });

    if (result.kind === 'error') {
      logger.info('swapVentureStatus refused', {
        userId,
        reason: result.reason,
        ventureIdToActivate: input.ventureIdToActivate,
        ventureIdToArchive:  input.ventureIdToArchive,
      });
      return { ok: false, reason: result.reason };
    }

    logger.info('Venture swap committed', {
      userId,
      activatedId: input.ventureIdToActivate,
      archivedId:  input.ventureIdToArchive ?? null,
    });

    // Surface the full updated venture list back to the caller so the
    // client can reconcile its local state without a separate refetch.
    const ventures = await prisma.venture.findMany({
      where:   { userId },
      orderBy: { updatedAt: 'desc' },
      select:  { id: true, name: true, archivedAt: true },
    });

    // Revalidate the recommendations page so server-rendered ventures
    // list reflects the swap on next navigation.
    revalidatePath('/discovery/recommendations');

    return {
      ok:            true,
      ventures:      ventures.map(v => ({
        id:         v.id,
        name:       v.name,
        archivedAt: v.archivedAt?.toISOString() ?? null,
      })),
      activatedName: result.activatedName,
      archivedName:  result.archivedName,
    };
  } catch (err) {
    logger.error(
      'Venture swap transaction failed',
      err instanceof Error ? err : new Error(String(err)),
      { userId },
    );
    return { ok: false, reason: 'not-found', message: 'Swap failed — try again in a moment.' };
  }
}
