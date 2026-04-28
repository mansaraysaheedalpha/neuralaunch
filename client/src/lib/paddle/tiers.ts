// src/lib/paddle/tiers.ts
//
// The ids below are REAL Paddle SANDBOX price ids. Promoting to
// production requires:
//   1. Creating equivalent products + prices in the Paddle production
//      dashboard (spec §2.4).
//   2. Replacing the ids in this file AND in lib/paddle/founding-members.ts
//      with the production-generated ids.
//   3. Flipping NEXT_PUBLIC_PADDLE_ENV to 'production' in Vercel.
// Sandbox and production are entirely separate Paddle accounts with
// separate id namespaces — none of these values carry over.

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
  'pri_01kpdhyc6th4715bj15rqbe54y': { tier: 'execute',  isFounder: false }, // $29/month
  'pri_01kpdhzw31cfhffbzbj4cmz8mg': { tier: 'execute',  isFounder: false }, // $279/year
  // Compound — standard public prices.
  // Annual is $470 ($118 saved of $588 = 20.07%) so the universal "Save 20%"
  // marketing badge is honest at every spot-check. Paddle dashboard MUST
  // mirror this — the constant is marketing display, Paddle is the actual
  // charge. If Paddle still bills $479, users see "Save 20%" but pay 18.5%.
  'pri_01kpdhpkmqcyp5ccfs9ft9qbwx': { tier: 'compound', isFounder: false }, // $49/month
  'pri_01kpdhvdzk2k50pn76x95xkj03': { tier: 'compound', isFounder: false }, // $470/year
  // Founding member — hidden prices, injected only by the backend when
  // the founding-slot counter confirms availability.
  'pri_01kpdj0yeht31xvdmq1b5wrvz6': { tier: 'execute',  isFounder: true  }, // $19/month
  'pri_01kpdhwqxr35hmd4agqsdehv98': { tier: 'compound', isFounder: true  }, // $29/month
};

const FREE_TIER: TierInfo = { tier: 'free', isFounder: false };

export function resolveTier(priceId: string | null | undefined): TierInfo {
  if (!priceId) return FREE_TIER;
  return PRICE_TO_TIER[priceId] ?? FREE_TIER;
}

/**
 * Maximum number of simultaneously active ventures allowed per tier.
 * Per docs/neuralaunch-pricing-spec.md §1.3 line "Active cycles at once"
 * and docs/neuralaunch-lifecycle-memory.md §2.2.
 *
 *   free     — 0 active ventures (one-off recommendation only, no roadmap)
 *   execute  — 1 active venture with one active cycle at a time
 *   compound — up to 3 active ventures in parallel
 */
export const TIER_VENTURE_LIMITS: Record<Tier, number> = {
  free:     0,
  execute:  1,
  compound: 3,
};

/**
 * Per-tier ceiling on PAUSED ventures. Without this the active cap
 * becomes cosmetic — a founder pauses venture A, starts B, pauses B,
 * starts C, accumulating unlimited ventures by parking each one.
 *
 * Numbers chosen so legitimate stepping-away has room without the cap
 * feeling punitive: Execute = 2 paused (3 non-completed total),
 * Compound = 4 paused (7 total). The motivational copy ("be honest
 * about what you'll come back to") lives in the pause confirm dialog,
 * not here.
 */
export const TIER_PAUSED_VENTURE_LIMITS: Record<Tier, number> = {
  free:     0,
  execute:  2,
  compound: 4,
};
