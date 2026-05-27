"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
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
 */
export interface TierPricing {
  monthly: string;
  annual: string;
  isFoundingRate: boolean;
  foundingSlotsRemaining: number;
  foundingMonthly: string;
}

export interface PricingSectionProps {
  execute: TierPricing;
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
  const viewerWasFoundingMember = Boolean(
    viewerSession?.user?.wasFoundingMember,
  );

  // Returning-user logic — preserved 1:1 from the previous PricingSection.
  const isReturningUser =
    viewerTier === "free" && viewerLastPaidTier !== null;
  const useReturningFoundingRate =
    isReturningUser && viewerWasFoundingMember;

  const effectivePricingByTier: Record<"execute" | "compound", TierPricing> =
    useReturningFoundingRate
      ? {
          execute: {
            ...execute,
            monthly: execute.foundingMonthly,
            isFoundingRate: true,
          },
          compound: {
            ...compound,
            monthly: compound.foundingMonthly,
            isFoundingRate: true,
          },
        }
      : { execute, compound };

  const foundingBannerVisible =
    execute.isFoundingRate || compound.isFoundingRate;
  const foundingSlotsRemaining = Math.max(
    execute.foundingSlotsRemaining,
    compound.foundingSlotsRemaining,
  );

  const viewerName = viewerSession?.user?.name ?? null;

  return (
    <div>
      {/* Returning-user welcome strip — hairline accent, mono caps. */}
      {isReturningUser && (
        <div
          className={`mx-auto mb-6 max-w-3xl border ${
            useReturningFoundingRate ? "border-accent" : "border-rule-strong"
          } px-6 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted`}
        >
          <p
            className={
              useReturningFoundingRate ? "text-accent" : "text-fg"
            }
          >
            Welcome back{viewerName ? ` · ${viewerName.split(" ")[0]}` : ""}
          </p>
          <p className="mt-2 normal-case tracking-normal text-fg-2">
            Your ventures, roadmaps, and progress are still here. Resubscribe
            anytime to continue where you left off.
            {useReturningFoundingRate && (
              <>
                {" "}
                <span className="font-medium text-accent">
                  Your founding rate (
                  {viewerLastPaidTier === "compound" ? "$29" : "$19"}/month) is
                  preserved.
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {/* Founding-rate banner — hairline accent. */}
      {foundingBannerVisible && !useReturningFoundingRate && (
        <div className="mx-auto mb-6 max-w-3xl border border-accent px-6 py-4 font-mono text-[11px] uppercase tracking-[0.14em]">
          <p className="text-accent">Founding member rates</p>
          <p className="mt-2 normal-case tracking-normal text-fg-2">
            First 50 users — Execute at{" "}
            <span className="font-medium text-accent">$19/month</span> forever,
            Compound at{" "}
            <span className="font-medium text-accent">$29/month</span> forever.
            {" "}
            <span className="text-muted">
              {foundingSlotsRemaining} of 50 slots remaining.
            </span>
          </p>
        </div>
      )}

      {/* Billing cycle — hairline mono switch. */}
      <div className="mx-auto mb-10 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Billing cycle"
          className="inline-flex border border-rule-strong font-mono text-[11px] uppercase tracking-[0.14em]"
        >
          <button
            type="button"
            role="radio"
            aria-checked={cycle === "monthly"}
            onClick={() => setCycle("monthly")}
            className={`px-5 py-2.5 transition-colors ${
              cycle === "monthly"
                ? "bg-accent text-bg"
                : "text-muted hover:text-fg"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={cycle === "annual"}
            onClick={() => setCycle("annual")}
            className={`border-l border-rule-strong px-5 py-2.5 transition-colors ${
              cycle === "annual"
                ? "bg-accent text-bg"
                : "text-muted hover:text-fg"
            }`}
          >
            Annual · save 20%
          </button>
        </div>
      </div>

      {/* Tier grid — hairline 3-column, no gaps. */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 border border-rule-strong lg:grid-cols-3">
        {TIERS.map((tier) => {
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
              featured={tier.id === "execute"}
            />
          );
        })}
      </div>

      <FairUseDisclosure />
    </div>
  );
}
