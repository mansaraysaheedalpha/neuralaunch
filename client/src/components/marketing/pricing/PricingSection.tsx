"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, Sparkles } from "lucide-react";
import TierUnlockStepper from "./TierUnlockStepper";
import TierCard from "./TierCard";
import FairUseDisclosure from "./FairUseDisclosure";
import { TIERS } from "./tier-data";

type BillingCycle = "annual" | "monthly";

/**
 * Per-tier pricing payload resolved server-side via getPriceIds().
 * Carries the standard monthly/annual price IDs, a flag that says
 * whether a founding slot is available right now, the slot count
 * used in the public banner, AND the *reserved* founding monthly
 * id used by the returning-user path (where the rate is honoured
 * regardless of public slot availability).
 *
 * Re-exported here because TierCard imports it; the legacy
 * PricingSection.tsx at the parent path re-exports this type so
 * existing imports (page.tsx) keep working without an edit.
 */
export interface TierPricing {
  monthly:                 string;
  annual:                  string;
  isFoundingRate:          boolean;
  foundingSlotsRemaining:  number;
  foundingMonthly:         string;
}

export interface PricingSectionProps {
  execute:  TierPricing;
  compound: TierPricing;
}

export function PricingSection({ execute, compound }: PricingSectionProps) {
  const [cycle, setCycle] = useState<BillingCycle>("annual");

  const { data: viewerSession } = useSession();
  const viewerTier = (viewerSession?.user?.tier ?? null) as
    | "free"
    | "execute"
    | "compound"
    | null;
  const viewerLastPaidTier = (viewerSession?.user?.lastPaidTier ?? null) as
    | "execute"
    | "compound"
    | null;
  const viewerWasFoundingMember = Boolean(viewerSession?.user?.wasFoundingMember);

  // Returning user: currently Free, has paid in the past. We greet them
  // and — if they were a founding member — preserve their founding rate
  // by overlaying the reserved foundingMonthly id onto each TierPricing
  // regardless of public slot availability.
  const isReturningUser           = viewerTier === "free" && viewerLastPaidTier !== null;
  const useReturningFoundingRate  = isReturningUser && viewerWasFoundingMember;

  const effectivePricingByTier: Record<"execute" | "compound", TierPricing> = useReturningFoundingRate
    ? {
        execute:  { ...execute,  monthly: execute.foundingMonthly,  isFoundingRate: true },
        compound: { ...compound, monthly: compound.foundingMonthly, isFoundingRate: true },
      }
    : { execute, compound };

  // Public founding banner: visible while at least one tier still has
  // slots, hidden once both are exhausted, AND hidden for returning
  // founders (who'd otherwise see two banners stacked).
  const foundingBannerVisible    = execute.isFoundingRate || compound.isFoundingRate;
  const foundingSlotsRemaining   = Math.max(
    execute.foundingSlotsRemaining,
    compound.foundingSlotsRemaining,
  );

  const viewerName = viewerSession?.user?.name ?? null;

  return (
    <>
      <TierUnlockStepper />

      {isReturningUser && (
        <div className="mx-auto mt-10 mb-8 max-w-2xl">
          <div
            className={`rounded-xl border px-6 py-4 text-center ${
              useReturningFoundingRate
                ? "border-gold/30 bg-gold/5"
                : "border-primary/30 bg-primary/5"
            }`}
          >
            <p
              className={`flex items-center justify-center gap-2 text-sm font-semibold ${
                useReturningFoundingRate ? "text-gold" : "text-primary"
              }`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Welcome back{viewerName ? `, ${viewerName.split(" ")[0]}` : ""}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Your ventures, roadmaps, and progress are still here. Resubscribe
              anytime to continue where you left off.
              {useReturningFoundingRate && (
                <>
                  {" "}
                  <span className="font-semibold text-gold">
                    Your founding member rate (
                    {viewerLastPaidTier === "compound" ? "$29" : "$19"}/month)
                    is preserved.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {foundingBannerVisible && !useReturningFoundingRate && (
        <div className="mx-auto mt-10 mb-8 max-w-2xl">
          <div className="rounded-xl border border-gold/20 bg-gold/5 px-6 py-4 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-gold">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Founding Member Rates
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              First 50 users: Execute at{" "}
              <span className="font-semibold text-gold">$19/month</span>{" "}
              forever. Compound at{" "}
              <span className="font-semibold text-gold">$29/month</span>{" "}
              forever.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {foundingSlotsRemaining} of 50 founding slots remaining
            </p>
          </div>
        </div>
      )}

      <div className={`flex justify-center ${isReturningUser || foundingBannerVisible ? "mb-10" : "mt-10 mb-10"}`}>
        <div
          role="radiogroup"
          aria-label="Billing cycle"
          className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-navy-900/80 p-1 shadow-sm"
        >
          <button
            type="button"
            role="radio"
            aria-checked={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 ${
              cycle === "monthly"
                ? "bg-primary text-white shadow"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={cycle === "annual"}
            onClick={() => setCycle("annual")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 ${
              cycle === "annual"
                ? "bg-primary text-white shadow"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Annual
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                cycle === "annual"
                  ? "bg-gold/15 text-gold border border-gold/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              Best value · Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* One-line affirmation under the toggle — shown ONLY when Annual
          is the active cycle. On Monthly the line read as "we recommend
          the other choice" while the user was standing in this one,
          which is contradiction not affirmation. The per-card loss-
          framing line ("You'd save $X/year on the annual plan") still
          carries the nudge on Monthly without doubling up. When real
          adoption data exists, swap copy to "Most founders choose annual." */}
      {cycle === "annual" && (
        <p className="-mt-6 mb-10 text-center text-xs text-slate-500">
          Recommended — saves you $69 on Execute, $118 on Compound.
        </p>
      )}

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
        {TIERS.map((tier, i) => {
          const pricing =
            tier.id === "execute"
              ? effectivePricingByTier.execute
              : tier.id === "compound"
                ? effectivePricingByTier.compound
                : null;
          const isPriorPlan =
            isReturningUser &&
            viewerLastPaidTier !== null &&
            tier.id === viewerLastPaidTier;
          return (
            <TierCard
              key={tier.id}
              tier={tier}
              cycle={cycle}
              pricing={pricing}
              isPriorPlan={isPriorPlan}
              isReturningFounder={useReturningFoundingRate}
              viewerTier={viewerTier}
              staggerIndex={i}
            />
          );
        })}
      </div>

      <FairUseDisclosure />
    </>
  );
}
