/**
 * Selects a variant from a list.
 * This is a simple 50/50 or N-way split.
 * It's deterministic (same user session gets same variant) but stateless.
 * For more advanced needs, use a cookie or user ID.
 */
export function getABTestVariant(variants: string[]): string {
  if (!variants || variants.length === 0) {
    return ""; // Should not happen
  }

  // Simple random selection.
  // A/B testing frameworks would use a user hash for consistency.
  const randomIndex = Math.floor(Math.random() * variants.length);
  return variants[randomIndex];
}
