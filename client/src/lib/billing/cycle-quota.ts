// src/lib/billing/cycle-quota.ts
//
// Per-billing-cycle quota enforcement for the four AI-heavy tools.
// Routes call enforceCycleQuota() AFTER requireTierOrThrow() so we
// can assume the caller is at least Execute tier. The helper:
//   1. Reads the user's tier + currentPeriodEnd from Subscription.
//   2. Resolves the right CYCLE_LIMITS key for (tool, tier).
//   3. Atomically increments + checks the cycle counter in Redis.
//   4. Throws HttpError(429) with a structured message when capped.
//
// readAllCycleUsage() is the read-only sibling used by /api/usage to
// power the UsageMeter component. No increment, no throw.

import 'server-only';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { HttpError } from '@/lib/validation/server-helpers';
import {
  checkCycleRateLimit,
  cycleKeyFor,
  getCycleUsage,
  type CycleTool,
} from '@/lib/rate-limit';
import type { Tier } from '@/lib/paddle/tiers';

const TOOLS: readonly CycleTool[] = ['research', 'coach', 'composer', 'packager'];

/**
 * Sentinel currentPeriodEnd used as a fallback when the user's
 * Subscription row is missing currentPeriodEnd (only possible for
 * legacy backfill rows — real Paddle subscriptions always carry it).
 * Keeps the Redis key stable across the calendar month so we still
 * accumulate against a meaningful bucket.
 */
function fallbackCycleEnd(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

interface SubscriptionView {
  tier:             Tier;
  currentPeriodEnd: Date;
}

async function readSubscription(userId: string): Promise<SubscriptionView> {
  const sub = await prisma.subscription.findUnique({
    where:  { userId },
    select: { tier: true, currentPeriodEnd: true },
  });
  const tier = (sub?.tier ?? 'free') as Tier;
  const currentPeriodEnd = sub?.currentPeriodEnd ?? fallbackCycleEnd();
  return { tier, currentPeriodEnd };
}

function formatResetCopy(resetsAt: string): string {
  try {
    return new Date(resetsAt).toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    });
  } catch {
    return resetsAt;
  }
}

/**
 * Increment + check the per-cycle counter for `tool`. Throws
 * HttpError(429) when the user has hit their tier's cap. Caller is
 * responsible for funneling the throw through httpErrorToResponse.
 */
export async function enforceCycleQuota(userId: string, tool: CycleTool): Promise<void> {
  const { tier, currentPeriodEnd } = await readSubscription(userId);

  if (tier !== 'execute' && tier !== 'compound') {
    // Defence-in-depth: the route's requireTierOrThrow gate should
    // have caught Free users already. If we land here, either the
    // gate was forgotten or the tier flipped between checks.
    throw new HttpError(403, 'This feature requires an Execute or Compound subscription.');
  }

  const key = cycleKeyFor(tool, tier);
  const result = await checkCycleRateLimit({ key, userId, cycleEndsAt: currentPeriodEnd });

  if (!result.success) {
    const upgradeHint = tier === 'execute'
      ? ' Upgrade to Compound for higher limits.'
      : '';
    throw new HttpError(
      429,
      `You've reached your monthly limit of ${result.limit} ${result.toolLabel} calls. Your quota resets on ${formatResetCopy(result.resetsAt)}.${upgradeHint}`,
    );
  }

  logger.debug('Cycle quota incremented', {
    userId,
    tool,
    tier,
    used:      result.used,
    remaining: result.remaining,
  });
}

export interface CycleUsageRow {
  tool:      CycleTool;
  toolLabel: string;
  used:      number;
  limit:     number;
  resetsAt:  string;
}

/**
 * Read-only snapshot of the user's per-cycle usage across all four
 * tools. Returns one row per tool. Free users get all-zero rows
 * keyed against the Execute-tier limits, since the meter UI only
 * surfaces for Execute+ users in the first place.
 */
export async function readAllCycleUsage(userId: string): Promise<CycleUsageRow[]> {
  const { tier, currentPeriodEnd } = await readSubscription(userId);
  const effectiveTier: 'execute' | 'compound' =
    tier === 'compound' ? 'compound' : 'execute';

  const rows = await Promise.all(
    TOOLS.map(async tool => {
      const key = cycleKeyFor(tool, effectiveTier);
      const usage = await getCycleUsage({ key, userId, cycleEndsAt: currentPeriodEnd });
      return {
        tool,
        toolLabel: usage.toolLabel,
        used:      usage.used,
        limit:     usage.limit,
        resetsAt:  usage.resetsAt,
      };
    }),
  );

  return rows;
}
