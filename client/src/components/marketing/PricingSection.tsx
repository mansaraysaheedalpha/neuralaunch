"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { SubscribeButton } from "@/components/SubscribeButton";

type BillingCycle = "annual" | "monthly";

/**
 * Pricing information resolved by the server component wrapper via
 * getPriceIds(). The monthly id swaps to the hidden founding price
 * when a slot is available — the client never knows or cares which.
 *
 * foundingMonthly carries the reserved founding price id *unconditionally*
 * (regardless of public slot availability). Used by the returning-user
 * path when `session.user.wasFoundingMember === true` — the founder's
 * rate-for-life promise means they pay the founding rate on return
 * subscription even after all 50 public slots have been claimed.
 */
export interface TierPricing {
  monthly: string;
  annual: string;
  isFoundingRate: boolean;
  foundingSlotsRemaining: number;
  foundingMonthly: string;
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
      "Two discovery interviews",
      "One full recommendation with reasoning",
      "See the alternatives rejected and why",
      "Honest falsification — what would make this wrong",
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
      "Everything in Free",
      "Push back up to seven rounds on recommendations",
      "Phased execution roadmap",
      "Conversation Coach — prepare for high-stakes conversations",
      "Outreach Composer — WhatsApp, email, LinkedIn drafts",
      "Research Tool — deep market research",
      "Service Packager — structure your service offering",
      "Task check-ins and diagnostic help",
      "1 active venture at a time",
    ],
    cta: "Start with Execute",
    badge: "Recommended",
    accent: "primary",
  },
  {
    name: "Compound",
    tagline: "The system gets smarter",
    monthly: 49,
    annual: 479,
    features: [
      "Everything in Execute",
      "Voice mode — speak answers instead of typing",
      "Live validation landing pages",
      "Build brief from real market signal",
      "Continuation brief at cycle end",
      "Fork selection into next cycle",
      "Cross-venture memory across all 3 of your ventures",
      "3 active ventures simultaneously",
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
  // Currently-signed-in user's tier (if any). Used to relabel the CTA
  // for tiers the user is already on, and to swap the upgrade-link
  // for a Settings-link when they're already on the highest tier.
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

  // Returning-user mode: signed-in user currently on Free who has
  // previously paid (any tier). We welcome them back, highlight their
  // prior tier, and — if they were a founding member — honour the
  // "rate for life" promise by preferring founding pricing regardless
  // of slot availability.
  const isReturningUser = viewerTier === "free" && viewerLastPaidTier !== null;
  const useReturningFoundingRate = isReturningUser && viewerWasFoundingMember;

  // For the returning-founding path, overlay the reserved
  // foundingMonthly id (always the $19/$29 price, regardless of public
  // slot count) into the TierPricing that drives the SubscribeButton.
  // isFoundingRate flips to true so the card renders the founding-rate
  // layout (discounted headline, "Locked in for life" note).
  const effectivePricingByTier: Record<"Execute" | "Compound", TierPricing> = useReturningFoundingRate
    ? {
        Execute: {
          ...execute,
          monthly:        execute.foundingMonthly,
          isFoundingRate: true,
        },
        Compound: {
          ...compound,
          monthly:        compound.foundingMonthly,
          isFoundingRate: true,
        },
      }
    : { Execute: execute, Compound: compound };

  // Either tier having a founding slot keeps the PUBLIC banner visible.
  // Returning founders always see founding pricing on their cards but
  // don't reserve a slot — don't show the public banner just for them.
  const foundingBannerVisible =
    execute.isFoundingRate || compound.isFoundingRate;
  const foundingSlotsRemaining = Math.max(
    execute.foundingSlotsRemaining,
    compound.foundingSlotsRemaining,
  );

  const pricingByTier = effectivePricingByTier;

  const viewerName = viewerSession?.user?.name ?? null;

  return (
    <>
      {/* Welcome-back banner — shown only to returning users (currently
          Free, previously paid). Mentions their preserved founding rate
          when applicable. Takes precedence over the public founding
          banner visually (stacked above). */}
      {isReturningUser && (
        <div className="mx-auto max-w-2xl mb-10">
          <div className={`rounded-xl border px-6 py-4 text-center ${
            useReturningFoundingRate
              ? "border-gold/30 bg-gold/5"
              : "border-primary/30 bg-primary/5"
          }`}>
            <p className={`text-sm font-semibold ${
              useReturningFoundingRate ? "text-gold" : "text-primary"
            }`}>
              Welcome back{viewerName ? `, ${viewerName.split(" ")[0]}` : ""}
            </p>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Your ventures, roadmaps, and progress are still here. Resubscribe
              anytime to continue where you left off.
              {useReturningFoundingRate && (
                <>
                  {" "}
                  <span className="text-gold font-semibold">
                    Your founding member rate (
                    {viewerLastPaidTier === "compound" ? "$29" : "$19"}/month) is
                    preserved.
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Founding member banner — hidden once all 50 slots are claimed
          OR once the viewer is a returning founder (they'd see a
          double-banner otherwise). */}
      {foundingBannerVisible && !useReturningFoundingRate && (
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

      {/* Billing toggle — segmented switch so both options read as
          mutually-exclusive choices, not a button + caption. */}
      <div className="flex justify-center mb-10">
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
                  ? "bg-white/20 text-white"
                  : "bg-success/15 text-success"
              }`}
            >
              Save 20%
            </span>
          </button>
        </div>
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
          // Returning user's prior tier — highlight the matching card.
          const isPriorPlan =
            isReturningUser &&
            viewerLastPaidTier !== null &&
            tier.name.toLowerCase() === viewerLastPaidTier;
          // Founding headline rate: $19 for Execute, $29 for Compound
          const foundingMonthlyRate =
            tier.name === "Execute" ? 19 : tier.name === "Compound" ? 29 : 0;

          return (
            <article
              key={tier.name}
              className={`relative flex h-full flex-col rounded-xl border p-7 transition-colors ${borderClass} ${bgClass} ${
                isPriorPlan ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-navy-950" : ""
              }`}
            >
              {tier.badge && !isPriorPlan && (
                <span
                  className={`absolute -top-3 left-7 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${badgeClass}`}
                >
                  {tier.badge}
                </span>
              )}
              {isPriorPlan && (
                <span className="absolute -top-3 left-7 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider bg-primary text-white">
                  Your previous plan
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
                    <p className="mt-1 text-xs font-medium text-gold">
                      {useReturningFoundingRate
                        ? "Your founding member rate"
                        : "Locked in for life"}
                    </p>
                    <p className="text-xs text-slate-400">
                      Standard rate ${tier.monthly}/mo
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
                {isPaid && (
                  <div className="mt-3 space-y-1 text-[11px] leading-relaxed text-slate-400">
                    <p>Renews automatically. Cancel anytime in Settings.</p>
                    {cycle === "annual" && (
                      <p>14-day refund on annual plans. Monthly non-refundable.</p>
                    )}
                  </div>
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
                {(() => {
                  // Already-subscribed user looking at the same tier they're
                  // on: don't show a Subscribe button, link to Settings → Billing.
                  // Same UX for a Compound user looking at the Execute card —
                  // there's no downgrade-from-pricing-page flow, route them to
                  // Settings if they want to change.
                  const tierRank: Record<string, number> = {
                    free: 0,
                    execute: 1,
                    compound: 2,
                  };
                  const cardRank = tierRank[tier.name.toLowerCase()] ?? 0;
                  const userRank = viewerTier ? tierRank[viewerTier] ?? 0 : -1;
                  const alreadyOnOrAbove = userRank >= cardRank && userRank >= 0 && cardRank > 0;
                  const isCurrentTier = viewerTier && viewerTier === tier.name.toLowerCase();

                  if (alreadyOnOrAbove) {
                    return (
                      <Link href="/settings" className={ctaClass}>
                        {isCurrentTier ? "Manage in Settings" : "Manage in Settings"}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    );
                  }

                  if (isPaid && priceId) {
                    return (
                      <SubscribeButton
                        priceId={priceId}
                        tierName={tier.name as "Execute" | "Compound"}
                        label={tier.cta}
                        className={ctaClass}
                      />
                    );
                  }

                  return (
                    <Link href="/signin" className={ctaClass}>
                      {tier.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  );
                })()}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
