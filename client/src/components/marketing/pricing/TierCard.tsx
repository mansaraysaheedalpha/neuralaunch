"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SubscribeButton } from "@/components/SubscribeButton";
import type { TierDefinition } from "./tier-data";
import type { TierPricing } from "../PricingSection";
import { computeAnnualSavings } from "./savings";

type BillingCycle = "monthly" | "annual";
type ViewerTier = "free" | "execute" | "compound" | null;

interface TierCardProps {
  tier: TierDefinition;
  cycle: BillingCycle;
  /** TierPricing for paid tiers; null for Free. */
  pricing: TierPricing | null;
  /** Set by the orchestrator when the viewer's previously-paid tier
   *  matches this card — surfaces an accent border + caption. */
  isPriorPlan: boolean;
  /** True when the orchestrator should overlay returning-founder copy
   *  on the founding-rate caption. */
  isReturningFounder: boolean;
  viewerTier: ViewerTier;
  /** Featured tier renders with the accent sub-gradient + accent CTA.
   *  Today this is Execute by convention (see TIERS in tier-data.ts). */
  featured: boolean;
}

const CELL_BASE =
  "flex flex-col gap-[18px] border-r border-rule p-9 last:border-r-0";
const CTA_BASE =
  "mt-auto inline-flex items-center justify-center gap-2.5 px-[18px] py-[13px] font-mono text-[11px] font-medium uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Institute-style tier card. Hairline grid cell (no rounded corners,
 * no shadow, no motion), monospace caps copy, single accent for the
 * featured tier. Visual grammar: direction-a.html .tier.
 *
 * Data layer (tier definition, founding-rate logic, savings math,
 * SubscribeButton wiring) is unchanged from the previous TierCard.
 */
export default function TierCard({
  tier,
  cycle,
  pricing,
  isPriorPlan,
  isReturningFounder,
  viewerTier,
  featured,
}: TierCardProps) {
  const isPaid = tier.id !== "free";

  const showFoundingNote =
    isPaid && pricing?.isFoundingRate === true && cycle === "monthly";
  const foundingMonthlyRate =
    tier.id === "execute" ? 19 : tier.id === "compound" ? 29 : 0;

  // CTA selection mirrors the previous TierCard exactly.
  const tierRank: Record<string, number> = { free: 0, execute: 1, compound: 2 };
  const cardRank = tierRank[tier.id] ?? 0;
  const userRank = viewerTier ? tierRank[viewerTier] ?? 0 : -1;
  const alreadyOnOrAbove = userRank >= cardRank && userRank >= 0 && cardRank > 0;

  const priceId =
    isPaid && pricing
      ? cycle === "annual"
        ? pricing.annual
        : pricing.monthly
      : null;

  const annualSavings = isPaid
    ? computeAnnualSavings(tier.monthly, tier.annual)
    : null;
  const monthlyEquivalent = isPaid ? (tier.annual / 12).toFixed(2) : null;

  const ctaClass = featured
    ? `${CTA_BASE} border border-accent bg-accent text-bg hover:opacity-90`
    : `${CTA_BASE} border border-rule-strong text-fg hover:border-accent hover:text-accent`;

  return (
    <article
      className={[
        CELL_BASE,
        featured
          ? "bg-[linear-gradient(180deg,rgba(255,90,60,0.08),rgba(255,90,60,0)_70%)]"
          : "",
        isPriorPlan ? "outline outline-1 outline-accent" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Eyebrow row — tier framing + featured / prior-plan accent. */}
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        <span>{tier.name}</span>
        <span className={featured || isPriorPlan ? "text-accent" : undefined}>
          {isPriorPlan
            ? "Your previous plan"
            : featured
              ? "Most chosen"
              : tier.id === "free"
                ? "Trust"
                : "Memory"}
        </span>
      </div>

      {/* Tier headline — large sans, tight letter-spacing. */}
      <h3 className="font-sans text-[28px] font-medium tracking-[-0.015em] text-fg">
        {tier.tagline}.
      </h3>

      {/* Price block — switches between standard, founding, and annual cycles. */}
      <div className="font-mono text-[13px] text-fg-2">
        {tier.monthly === 0 ? (
          <>
            <span className="block font-sans text-[40px] font-medium tracking-[-0.025em] text-fg">
              $0
            </span>
            One interview. One recommendation. Yours to keep.
          </>
        ) : showFoundingNote ? (
          <>
            <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Founding rate
            </span>
            <span className="mt-1 flex items-baseline gap-2">
              <span className="font-sans text-[40px] font-medium tracking-[-0.025em] text-fg">
                ${foundingMonthlyRate}
                <span className="ml-1 font-mono text-[14px] text-muted">/mo</span>
              </span>
              <span className="font-mono text-[12px] text-muted-2 line-through decoration-muted">
                ${tier.monthly}
              </span>
            </span>
            <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              {isReturningFounder
                ? "Your rate — preserved for life"
                : "Locked in for life · rate never changes"}
            </span>
          </>
        ) : cycle === "annual" && annualSavings ? (
          <>
            <span className="block font-sans text-[40px] font-medium tracking-[-0.025em] text-fg">
              ${tier.annual}
              <span className="ml-1 font-mono text-[14px] text-muted">/year</span>
            </span>
            ${monthlyEquivalent}/mo equivalent · save ${annualSavings.saved} (
            {annualSavings.percent}%)
          </>
        ) : (
          <>
            <span className="block font-sans text-[40px] font-medium tracking-[-0.025em] text-fg">
              ${tier.monthly}
              <span className="ml-1 font-mono text-[14px] text-muted">/mo</span>
            </span>
            {annualSavings && annualSavings.saved > 0 ? (
              <>You&rsquo;d save ${annualSavings.saved}/year on the annual plan.</>
            ) : (
              <>Per founder. Cancel anytime.</>
            )}
          </>
        )}
      </div>

      {/* Feature list — flat across groups so the cell reads as one
          editorial column. Each line is a hairline-accent dash + text.
          Notes ride the group label as italic sub-copy when present. */}
      <ul className="grid gap-2.5 border-t border-rule pt-4 text-[14px] leading-[1.5] text-fg-2">
        {tier.groups.flatMap((group, gi) => {
          const groupKey = `${tier.id}-g${gi}`;
          const header =
            group.items.length === 0 || group.note ? (
              <li
                key={`${groupKey}-h`}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted [&:not(:first-child)]:mt-2"
              >
                {group.label}
                {group.note && (
                  <span className="ml-2 normal-case tracking-normal text-muted-2">
                    {group.note}
                  </span>
                )}
              </li>
            ) : null;
          const items = group.items.map((item, ii) => (
            <li
              key={`${groupKey}-i${ii}`}
              className="relative pl-5 before:absolute before:left-0 before:top-[10px] before:h-px before:w-2.5 before:bg-accent"
            >
              {item}
            </li>
          ));
          return header ? [header, ...items] : items;
        })}
      </ul>

      {/* CTA — mirrors the previous TierCard's already-on / paid / signin branch. */}
      {alreadyOnOrAbove ? (
        <Link href="/settings" className={ctaClass}>
          Manage in Settings
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      ) : isPaid && priceId ? (
        <SubscribeButton
          priceId={priceId}
          tierName={tier.name as "Execute" | "Compound"}
          label={tier.cta}
          className={ctaClass}
        />
      ) : (
        <Link href="/signin" className={ctaClass}>
          {tier.cta}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      )}
    </article>
  );
}
