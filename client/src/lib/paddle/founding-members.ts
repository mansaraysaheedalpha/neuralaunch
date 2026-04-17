// src/lib/paddle/founding-members.ts
import 'server-only';
import prisma from '@/lib/prisma';
import type { Tier } from './tiers';

/**
 * Total founding slots across the launch. Hard-coded to match the
 * commitment on the pricing page — the first 50 paying users on each
 * tier get the founding rate for life. The count is tier-global
 * (execute + compound share the same pool) per the spec §1.2.
 */
const FOUNDING_MEMBER_LIMIT = 50;

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
    monthly:  'pri_exec_mo_01',
    annual:   'pri_exec_yr_01',
    founding: 'pri_exec_fnd_01',
  },
  compound: {
    monthly:  'pri_comp_mo_01',
    annual:   'pri_comp_yr_01',
    founding: 'pri_comp_fnd_01',
  },
};

/**
 * Resolve the price ids the pricing page should use for a given tier.
 *
 * One DB round trip per call — cheap, but each render of the pricing
 * page hits it. If that ever becomes hot, wrap with a short-TTL
 * Upstash cache keyed on `founding-slots:v1`; invalidate from the
 * webhook processor when isFoundingMember rolls over.
 */
export async function getPriceIds(tier: 'execute' | 'compound'): Promise<TierPriceIds> {
  const used = await getFoundingMemberCount();
  const available = used < FOUNDING_MEMBER_LIMIT;
  const ids = PRICE_IDS[tier];
  return {
    monthly:                available ? ids.founding : ids.monthly,
    annual:                 ids.annual,
    isFoundingRate:         available,
    foundingSlotsRemaining: available ? Math.max(FOUNDING_MEMBER_LIMIT - used, 0) : 0,
  };
}
