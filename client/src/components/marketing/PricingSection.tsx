"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { SubscribeButton } from "@/components/SubscribeButton";

type BillingCycle = "annual" | "monthly";

/**
 * Pricing information resolved by the server component wrapper via
 * getPriceIds(). The monthly id swaps to the hidden founding price
 * when a slot is available — the client never knows or cares which.
 */
export interface TierPricing {
  monthly: string;
  annual: string;
  isFoundingRate: boolean;
  foundingSlotsRemaining: number;
}

interface Tier {
  name: "Free" | "Execute" | "Compound";
  tagline: string;
  monthly: number;
  annual: number;
  features: string[];
  cta: string;
  badge?: string;
  accent: "primary" | "gold" | "muted";
}

const TIERS: Tier[] = [
  {
    name: "Free",
    tagline: "Your first honest answer",
    monthly: 0,
    annual: 0,
    features: [
      "Complete discovery interview",
      "One full recommendation, with reasoning",
      "Push back up to seven rounds",
      "See the alternatives the system rejected",
    ],
    cta: "Start free",
    accent: "muted",
  },
  {
    name: "Execute",
    tagline: "From recommendation to revenue",
    monthly: 29,
    annual: 279,
    features: [
      "Phased execution roadmap",
      "Conversation Coach",
      "Outreach Composer",
      "Research Tool",
      "Task check-ins and diagnostic help",
      "Parking lot for adjacent ideas",
    ],
    cta: "Start with Execute",
    badge: "Most popular",
    accent: "primary",
  },
  {
    name: "Compound",
    tagline: "The system gets smarter",
    monthly: 49,
    annual: 479,
    features: [
      "Everything in Execute",
      "Live validation landing page",
      "Build brief from real market signal",
      "Continuation brief at cycle end",
      "Fork selection into next cycle",
      "Full cross-cycle memory",
    ],
    cta: "Start with Compound",
    badge: "Premium",
    accent: "gold",
  },
];

function annualSavings(tier: Tier): number {
  return tier.monthly * 12 - tier.annual;
}

interface PricingSectionProps {
  execute: TierPricing;
  compound: TierPricing;
}

export function PricingSection({ execute, compound }: PricingSectionProps) {
  const [cycle, setCycle] = useState<BillingCycle>("annual");

  // Either tier having a founding slot keeps the banner visible. The
  // per-tier detail lives in each card's "Founding rate" line below.
  const foundingBannerVisible =
    execute.isFoundingRate || compound.isFoundingRate;
  const foundingSlotsRemaining = Math.max(
    execute.foundingSlotsRemaining,
    compound.foundingSlotsRemaining,
  );

  const pricingByTier: Record<"Execute" | "Compound", TierPricing> = {
    Execute: execute,
    Compound: compound,
  };

  return (
    <>
      {/* Founding member banner — hidden once all 50 slots are claimed. */}
      {foundingBannerVisible && (
        <div className="mx-auto max-w-2xl mb-10">
          <div className="rounded-xl border border-gold/20 bg-gold/5 px-6 py-4 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-gold">
              <Sparkles className="size-4" aria-hidden="true" />
              Founding Member Rates
            </p>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              First 50 users: Execute at{" "}
              <span className="text-gold font-semibold">$19/month</span>{" "}
              forever. Compound at{" "}
              <span className="text-gold font-semibold">$29/month</span>{" "}
              forever.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {foundingSlotsRemaining} of 50 founding slots remaining
            </p>
          </div>
        </div>
      )}

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <button
          type="button"
          onClick={() => setCycle("monthly")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            cycle === "monthly"
              ? "bg-primary text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setCycle("annual")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            cycle === "annual"
              ? "bg-primary text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Annual
          <span className="ml-1.5 text-xs text-success">Save up to 20%</span>
        </button>
      </div>

      {/* Tier cards */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {TIERS.map((tier) => {
          const borderClass =
            tier.accent === "primary"
              ? "border-primary shadow-lg shadow-primary/10"
              : tier.accent === "gold"
                ? "border-gold/40 shadow-lg shadow-gold/10"
                : "border-slate-800";
          const bgClass =
            tier.accent === "primary"
              ? "bg-navy-800"
              : tier.accent === "gold"
                ? "bg-navy-800"
                : "bg-navy-900";
          const badgeClass =
            tier.accent === "gold"
              ? "bg-gold text-white"
              : "bg-primary text-white";
          const checkClass =
            tier.accent === "gold"
              ? "text-gold"
              : tier.accent === "primary"
                ? "text-primary"
                : "text-success";
          const ctaClass =
            tier.accent === "primary"
              ? "inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 bg-primary text-white hover:bg-blue-700 focus-visible:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
              : tier.accent === "gold"
                ? "inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 bg-gold text-white hover:opacity-90 focus-visible:ring-gold disabled:opacity-60 disabled:cursor-not-allowed"
                : "inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 border border-slate-700 bg-transparent text-white hover:border-slate-500 hover:bg-slate-800 focus-visible:ring-slate-500";

          const isPaid = tier.name !== "Free";
          const pricing = isPaid
            ? pricingByTier[tier.name as "Execute" | "Compound"]
            : null;
          const priceId = pricing
            ? cycle === "annual"
              ? pricing.annual
              : pricing.monthly
            : null;
          // Founding rate only applies to monthly — mirrors spec §1.2.
          const showFoundingNote =
            pricing?.isFoundingRate && cycle === "monthly";
          // Founding headline rate: $19 for Execute, $29 for Compound
          const foundingMonthlyRate =
            tier.name === "Execute" ? 19 : tier.name === "Compound" ? 29 : 0;

          return (
            <article
              key={tier.name}
              className={`relative flex h-full flex-col rounded-xl border p-7 transition-colors ${borderClass} ${bgClass}`}
            >
              {tier.badge && (
                <span
                  className={`absolute -top-3 left-7 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${badgeClass}`}
                >
                  {tier.badge}
                </span>
              )}
              <h3 className="text-lg font-semibold text-white">{tier.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{tier.tagline}</p>

              {/* Price */}
              <div className="mt-5">
                {tier.monthly === 0 ? (
                  <p className="text-3xl font-bold text-white">$0</p>
                ) : showFoundingNote ? (
                  <>
                    <p className="text-3xl font-bold text-white">
                      ${foundingMonthlyRate}
                      <span className="text-lg font-medium text-slate-400">
                        /mo
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-gold">
                      Founding member rate — ${tier.monthly}/mo after launch
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-white">
                      ${tier.monthly}
                      <span className="text-lg font-medium text-slate-400">
                        /mo
                      </span>
                    </p>
                    {cycle === "annual" && (
                      <p className="mt-1 text-xs text-slate-400">
                        Billed annually — ${tier.annual}/year{" "}
                        <span className="text-success font-medium">
                          save ${annualSavings(tier)}
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>

              <ul className="mt-6 space-y-2.5 text-sm">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-slate-300"
                  >
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${checkClass}`}
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-8">
                {isPaid && priceId ? (
                  <SubscribeButton
                    priceId={priceId}
                    tierName={tier.name as "Execute" | "Compound"}
                    label={tier.cta}
                    className={ctaClass}
                  />
                ) : (
                  <Link href="/signin" className={ctaClass}>
                    {tier.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
