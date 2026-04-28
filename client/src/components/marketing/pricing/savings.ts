/**
 * Compute annual savings from monthly + annual prices. Used by TierCard
 * so the "Save N%" copy is never hardcoded — it derives from the same
 * constants the SubscribeButton charges against. If Paddle and the
 * marketing constants drift, the badge moves with them instead of lying.
 */
export interface AnnualSavings {
  /** Dollars saved per year vs paying monthly × 12. */
  saved:   number;
  /** Percent rounded to nearest integer (e.g. 20 for 20.07%). */
  percent: number;
}

export function computeAnnualSavings(
  monthly: number,
  annual:  number,
): AnnualSavings {
  const yearAtMonthly = monthly * 12;
  const saved         = Math.max(yearAtMonthly - annual, 0);
  const percent       = yearAtMonthly === 0 ? 0 : Math.round((saved / yearAtMonthly) * 100);
  return { saved, percent };
}
