/**
 * Re-export shim — the implementation moved into ./pricing/ during the
 * 2026-04-28 redesign so the section could be split below the 200-line
 * cap. This file remains as a stable import path for callers (notably
 * page.tsx) so the redesign was a one-file edit at the call site.
 */
export { PricingSection, type TierPricing, type PricingSectionProps } from "./pricing/PricingSection";
