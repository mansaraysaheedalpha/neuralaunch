// src/lib/paddle/tiers.ts
//
// NOTE: Replace placeholder price IDs with actual Paddle dashboard IDs
// before production deployment. The current placeholders are used for
// type-checking and test infrastructure only. The real IDs are
// generated when the products and prices are created in the Paddle
// dashboard (see docs/neuralaunch-pricing-spec.md §2.4).

/**
 * Public tier names used throughout the app for gating decisions.
 * Kept as a narrow string union so the compiler catches typos at every
 * call site rather than silently treating 'Execute' !== 'execute'.
 */
export type Tier = 'free' | 'execute' | 'compound';

export interface TierInfo {
  tier:      Tier;
  isFounder: boolean;
}

/**
 * Every Paddle Price the backend recognises, mapped to the product tier
 * and whether it is a founding-member (hidden) price. The webhook
 * processor calls resolveTier(priceId) on subscription.created and
 * subscription.updated to stamp the correct tier onto the Subscription
 * row. Any price id not listed here is treated as 'free' — a safe
 * default if a Paddle dashboard price is added without updating this
 * map, but noisy enough in logs to be caught during QA.
 */
export const PRICE_TO_TIER: Record<string, TierInfo> = {
  // Execute — standard public prices.
  'pri_exec_mo_01':  { tier: 'execute',  isFounder: false },
  'pri_exec_yr_01':  { tier: 'execute',  isFounder: false },
  // Compound — standard public prices.
  'pri_comp_mo_01':  { tier: 'compound', isFounder: false },
  'pri_comp_yr_01':  { tier: 'compound', isFounder: false },
  // Founding member — hidden prices, injected only by the backend when
  // the founding-slot counter confirms availability.
  'pri_exec_fnd_01': { tier: 'execute',  isFounder: true  },
  'pri_comp_fnd_01': { tier: 'compound', isFounder: true  },
};

const FREE_TIER: TierInfo = { tier: 'free', isFounder: false };

export function resolveTier(priceId: string | null | undefined): TierInfo {
  if (!priceId) return FREE_TIER;
  return PRICE_TO_TIER[priceId] ?? FREE_TIER;
}
