"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { SubscribeButton } from "@/components/SubscribeButton";
import type { TierDefinition } from "./tier-data";
import type { TierPricing } from "../PricingSection";
import { computeAnnualSavings } from "./savings";

const SPRING: Transition = {
  type:      "spring",
  stiffness: 240,
  damping:   28,
};

type BillingCycle = "monthly" | "annual";
type ViewerTier   = "free" | "execute" | "compound" | null;

interface TierCardProps {
  tier:           TierDefinition;
  cycle:          BillingCycle;
  /** TierPricing for paid tiers; null for Free. */
  pricing:        TierPricing | null;
  /** Set by the orchestrator when the viewer's previously-paid tier
   *  matches this card — surfaces a "Your previous plan" ring. */
  isPriorPlan:    boolean;
  /** True when the orchestrator should overlay returning-founder copy
   *  on the founding-rate caption. */
  isReturningFounder: boolean;
  viewerTier:     ViewerTier;
  /** Stagger index for the viewport-enter motion (Free=0, Execute=1, Compound=2). */
  staggerIndex:   number;
}

const ACCENT = {
  muted: {
    border:    "border-slate-800",
    bg:        "bg-navy-900",
    badgeBg:   "bg-primary text-white",
    check:     "text-success",
    cta:       "border border-slate-700 bg-transparent text-white hover:border-slate-500 hover:bg-slate-800 focus-visible:ring-slate-500",
    groupRule: "border-slate-800",
    groupLbl:  "text-slate-500",
  },
  primary: {
    border:    "border-primary/40 shadow-xl shadow-primary/10",
    bg:        "bg-navy-800",
    badgeBg:   "bg-primary text-white",
    check:     "text-primary",
    cta:       "bg-primary text-white hover:bg-blue-700 focus-visible:ring-primary",
    groupRule: "border-slate-800",
    groupLbl:  "text-primary/80",
  },
  gold: {
    border:    "border-gold/40 shadow-xl shadow-gold/10",
    bg:        "bg-navy-800",
    badgeBg:   "bg-gold text-white",
    check:     "text-gold",
    cta:       "bg-gold text-white hover:opacity-90 focus-visible:ring-gold",
    groupRule: "border-slate-800",
    groupLbl:  "text-gold/80",
  },
} as const;

const CTA_BASE =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 disabled:opacity-60 disabled:cursor-not-allowed";

export default function TierCard({
  tier,
  cycle,
  pricing,
  isPriorPlan,
  isReturningFounder,
  viewerTier,
  staggerIndex,
}: TierCardProps) {
  const reduce = useReducedMotion();
  const accent = ACCENT[tier.accent];
  const isPaid = tier.id !== "free";

  // Founding-rate display only kicks in on the monthly cycle (annual
  // founding rate doesn't exist) and only when the resolved TierPricing
  // says so. The boolean is computed here so the price block stays
  // declarative.
  const showFoundingNote = isPaid && pricing?.isFoundingRate === true && cycle === "monthly";
  const foundingMonthlyRate = tier.id === "execute" ? 19 : tier.id === "compound" ? 29 : 0;

  // CTA selection: a viewer already on this tier or a higher one
  // routes to Settings instead of re-subscribing. This logic is
  // preserved 1:1 from the original PricingSection so existing
  // subscribers never see a confusing duplicate-checkout button.
  const tierRank: Record<string, number> = { free: 0, execute: 1, compound: 2 };
  const cardRank        = tierRank[tier.id] ?? 0;
  const userRank        = viewerTier ? tierRank[viewerTier] ?? 0 : -1;
  const alreadyOnOrAbove = userRank >= cardRank && userRank >= 0 && cardRank > 0;

  const priceId =
    isPaid && pricing
      ? cycle === "annual"
        ? pricing.annual
        : pricing.monthly
      : null;

  const annualSavings = isPaid ? computeAnnualSavings(tier.monthly, tier.annual) : null;

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15%" }}
      transition={reduce ? undefined : { ...SPRING, delay: staggerIndex * 0.08 }}
      className={`relative flex h-full flex-col rounded-2xl border p-7 lg:p-8 transition-colors ${accent.border} ${accent.bg} ${
        isPriorPlan ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-navy-950" : ""
      }`}
    >
      {/* Top badge — "Recommended", "Premium", or "Your previous plan". */}
      {tier.badge && !isPriorPlan && (
        <span
          className={`absolute -top-3 left-7 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${accent.badgeBg}`}
        >
          {tier.badge}
        </span>
      )}
      {isPriorPlan && (
        <span className="absolute -top-3 left-7 inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
          Your previous plan
        </span>
      )}

      {/* Header */}
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
              <span className="text-lg font-medium text-slate-400">/mo</span>
            </p>
            <p className="mt-1 text-xs font-medium text-gold">
              {isReturningFounder ? "Your founding member rate" : "Locked in for life"}
            </p>
            <p className="text-xs text-slate-400">
              Standard rate ${tier.monthly}/mo
            </p>
          </>
        ) : (
          <>
            <p className="text-3xl font-bold text-white">
              ${tier.monthly}
              <span className="text-lg font-medium text-slate-400">/mo</span>
            </p>
            {cycle === "annual" && annualSavings && (
              <p className="mt-1 text-xs text-slate-400">
                Billed annually — ${tier.annual}/year{" "}
                <span className="font-medium text-success">
                  save ${annualSavings.saved} ({annualSavings.percent}%)
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

      {/* Feature sub-sections */}
      <div className="mt-7 space-y-6">
        {tier.groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? `border-t ${accent.groupRule} pt-5` : undefined}>
            <h4 className={`text-[11px] font-semibold uppercase tracking-wider ${accent.groupLbl}`}>
              {group.label}
            </h4>
            {group.note && (
              <p className="mt-1.5 text-xs text-slate-400">{group.note}</p>
            )}
            {group.items.length > 0 && (
              <ul role="list" className="mt-3 space-y-2 text-sm">
                {group.items.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-slate-300">
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${accent.check}`}
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-auto pt-8">
        {alreadyOnOrAbove ? (
          <Link href="/settings" className={`${CTA_BASE} ${accent.cta}`}>
            Manage in Settings
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : isPaid && priceId ? (
          <SubscribeButton
            priceId={priceId}
            tierName={tier.name as "Execute" | "Compound"}
            label={tier.cta}
            className={`${CTA_BASE} ${accent.cta}`}
          />
        ) : (
          <Link href="/signin" className={`${CTA_BASE} ${accent.cta}`}>
            {tier.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </motion.article>
  );
}
