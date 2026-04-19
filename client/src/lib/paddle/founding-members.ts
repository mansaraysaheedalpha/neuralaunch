// src/lib/paddle/founding-members.ts
import 'server-only';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { Tier } from './tiers';

/**
 * Total founding slots across the launch. Hard-coded to match the
 * commitment on the pricing page — the first 50 paying users on each
 * tier get the founding rate for life. The count is tier-global
 * (execute + compound share the same pool) per the spec §1.2.
 */
const FOUNDING_MEMBER_LIMIT = 50;

/**
 * Soft over-allocation alert threshold. The slot allocation has an
 * accepted TOCTOU race (see ACCEPTED RACE below) so we may mint a few
 * extra founders past 50. Crossing this threshold means the race has
 * leaked further than expected and warrants investigation — typically
 * a sign that the pricing page is being slammed by automation, not
 * that 5+ legitimate users hit the same second.
 */
const FOUNDING_OVERFLOW_ALERT = 55;

/**
 * ACCEPTED RACE — founding-member slot allocation is TOCTOU.
 *
 * `getPriceIds()` reads the live count at pricing-page render time and
 * decides whether to issue the founding price id. The actual
 * `isFoundingMember=true` flag is written by the webhook processor
 * AFTER checkout completes. Two users hitting the pricing page within
 * seconds of slot 49 both see "available" and both get founding pricing;
 * both webhooks then write isFoundingMember=true for slots 50 AND 51.
 *
 * The system stays internally consistent (each row carries the price
 * the user was actually charged at), but the "first 50" promise on the
 * pricing page is enforced softly, not strictly.
 *
 * Why we accept it:
 *   - Properly enforcing "exactly 50" requires reconciling Paddle-side
 *     state with our side at webhook time: read count, if >= 50 then
 *     update the Paddle subscription to the standard price via API and
 *     prorate the difference. That's a non-trivial two-system saga.
 *   - The dollar impact is small: even 10 extra founders at the $19/mo
 *     vs $29/mo Execute delta is $100/mo of "lost" revenue forever.
 *   - The race window is small (counted in seconds) — at sustainable
 *     traffic levels we expect 0-2 over-allocations at most.
 *   - A logger.error fires when the count crosses FOUNDING_OVERFLOW_ALERT
 *     so we'll see if the leak grows unexpectedly.
 */

/** Currently-minted founding-member subscriptions (across all tiers). */
export async function getFoundingMemberCount(): Promise<number> {
  return prisma.subscription.count({
    where: { isFoundingMember: true },
  });
}

/** True if there is at least one unclaimed founding slot. */
export async function isFoundingSlotAvailable(): Promise<boolean> {
  const used = await getFoundingMemberCount();
  return used < FOUNDING_MEMBER_LIMIT;
}

/**
 * Called by the webhook processor immediately after writing a row
 * with isFoundingMember=true. If the count crosses the soft alert
 * threshold (55), emits a logger.error so the operator (or Sentry,
 * once it's wired) gets paged. Pure observability — never blocks
 * the webhook or refunds anyone.
 */
export async function checkFoundingOverflow(): Promise<void> {
  let count: number;
  try {
    count = await getFoundingMemberCount();
  } catch {
    // Don't fail the webhook over an observability check.
    return;
  }
  if (count >= FOUNDING_OVERFLOW_ALERT) {
    logger.error(
      'Founding-member soft cap exceeded',
      new Error('founding-overflow'),
      {
        currentCount: count,
        limit:        FOUNDING_MEMBER_LIMIT,
        alertAt:      FOUNDING_OVERFLOW_ALERT,
      },
    );
  }
}

export interface TierPriceIds {
  /**
   * The price id the SubscribeButton should use for the monthly
   * checkout. When founding slots are available this is the hidden
   * founding price; otherwise the standard monthly price.
   */
  monthly: string;
  /**
   * Annual price id. There is no founding annual rate per spec §1.2 —
   * the annual price is always the standard annual price.
   */
  annual: string;
  /** True if `monthly` currently resolves to a founding-member price. */
  isFoundingRate: boolean;
  /** Remaining founding slots (across all tiers), or 0 when exhausted. */
  foundingSlotsRemaining: number;
}

// Product-tier → (founding monthly, standard monthly, standard annual)
// price id map. The founding monthly prices are Paddle's hidden catalogue
// entries — never rendered to the browser unless the backend verifies a
// slot is available. See docs/neuralaunch-pricing-spec.md §2.4 for the
// dashboard configuration that generates these ids.
const PRICE_IDS: Record<
  Exclude<Tier, 'free'>,
  { monthly: string; annual: string; founding: string }
> = {
  execute: {
    monthly:  'pri_01kpdhyc6th4715bj15rqbe54y', // $29/month standard
    annual:   'pri_01kpdhzw31cfhffbzbj4cmz8mg', // $279/year (no founding annual — spec §1.2)
    founding: 'pri_01kpdj0yeht31xvdmq1b5wrvz6', // $19/month founding (hidden)
  },
  compound: {
    monthly:  'pri_01kpdhpkmqcyp5ccfs9ft9qbwx', // $49/month standard
    annual:   'pri_01kpdhvdzk2k50pn76x95xkj03', // $479/year (no founding annual — spec §1.2)
    founding: 'pri_01kpdhwqxr35hmd4agqsdehv98', // $29/month founding (hidden)
  },
};

/**
 * Resolve the price ids the pricing page should use for a given tier.
 *
 * One DB round trip per call — cheap, but each render of the pricing
 * page hits it. If that ever becomes hot, wrap with a short-TTL
 * Upstash cache keyed on `founding-slots:v1`; invalidate from the
 * webhook processor when isFoundingMember rolls over.
 *
 * Fail-safe: if the count query errors (database unreachable at build
 * time, transient connection issue), we return the STANDARD (non-
 * founding) pricing. Showing $29/mo when we could have shown $19/mo
 * is a far smaller harm than crashing the entire landing page render.
 */
export async function getPriceIds(tier: 'execute' | 'compound'): Promise<TierPriceIds> {
  const ids = PRICE_IDS[tier];
  let used: number;
  try {
    used = await getFoundingMemberCount();
  } catch {
    return {
      monthly:                ids.monthly,
      annual:                 ids.annual,
      isFoundingRate:         false,
      foundingSlotsRemaining: 0,
    };
  }
  const available = used < FOUNDING_MEMBER_LIMIT;
  return {
    monthly:                available ? ids.founding : ids.monthly,
    annual:                 ids.annual,
    isFoundingRate:         available,
    foundingSlotsRemaining: available ? Math.max(FOUNDING_MEMBER_LIMIT - used, 0) : 0,
  };
}
