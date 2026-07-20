"use client";

import Link from "next/link";
import { TierCardFrame } from "@/components/marketing/pricing/TierCard";
import type { ServicePackage } from "@/lib/roadmap/service-packager/schemas";
import { PackagerReasoning } from "./PackagerReasoning";
import { PackageDecisionPanel } from "./PackageDecisionPanel";
import { RevenueScenarios } from "./RevenueScenarios";

interface TierResultsProps {
  pkg: ServicePackage;
  roadmapId?: string;
  sessionId?: string;
  onRegenerate?: (model: string) => void;
}

export function TierResults({
  pkg,
  roadmapId,
  sessionId,
  onRegenerate,
}: TierResultsProps) {
  const recommendedTierName = pkg.decision?.recommendedTierName;
  const copyOffer = () => void navigator.clipboard.writeText(pkg.brief);
  return (
    <section className="flex min-w-0 flex-col gap-8 px-6 py-8 sm:px-10">
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <span>02 · Package</span>
        <span className="text-accent">{pkg.tiers.length} tiers</span>
      </div>
      <header className="border-b border-rule pb-6">
        <div className="mb-3 flex flex-wrap gap-4 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
          <span>Pricing synthesis</span>
          <span>{pkg.tiers.length} generated tiers</span>
          <span className="text-accent">{pkg.serviceName}</span>
        </div>
        <h2 className="font-serif text-[25px] italic leading-tight text-fg">
          A deliberate price ladder —{" "}
          <em className="not-italic text-accent">
            {pkg.decision?.recommendation ??
              "each tier creates a clear scope and price tradeoff."}
          </em>
        </h2>
      </header>
      {pkg.decision && <PackageDecisionPanel decision={pkg.decision} />}
      <div className="grid border border-rule-strong md:grid-cols-2 xl:grid-cols-3">
        {pkg.tiers.map((tier, index) => {
          const recommended = tier.name === recommendedTierName;
          return (
            <TierCardFrame key={`${tier.name}-${index}`} featured={recommended}>
              <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                <span>
                  {toRoman(index + 1)} · {tier.name}
                </span>
                <span className={recommended ? "text-accent" : ""}>
                  {recommended
                    ? "Recommended first"
                    : index === 0
                      ? "Entry"
                      : index === pkg.tiers.length - 1
                        ? "Anchor"
                        : "Option"}
                </span>
              </div>
              <h3 className="font-serif text-[30px] italic leading-none text-fg">
                {tier.displayName}
              </h3>
              <div>
                <strong className="block font-sans text-[38px] font-medium tracking-tight text-fg">
                  {tier.price}
                  <small className="ml-1 font-mono text-[11px] text-muted">
                    {tier.period}
                  </small>
                </strong>
              </div>
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-y border-rule py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg md:hidden">
                  View scope{" "}
                  <span
                    aria-hidden="true"
                    className="text-accent group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="hidden gap-4 pt-4 group-open:grid md:!grid">
                  <p className="text-[13px] text-fg-2">{tier.description}</p>
                  <ul className="grid gap-2 border-t border-rule pt-4 text-[13px] text-fg-2">
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="relative pl-5 before:absolute before:left-0 before:text-accent before:content-['—']"
                      >
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <p className="border-t border-rule pt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                    Who it&apos;s for{" "}
                    <b className="ml-2 font-sans normal-case tracking-normal text-fg-2">
                      {pkg.targetClient}
                    </b>
                  </p>
                </div>
              </details>
            </TierCardFrame>
          );
        })}
      </div>
      <RevenueScenarios scenarios={pkg.revenueScenarios} />
      <PackagerReasoning tiers={pkg.tiers} />
      {onRegenerate && (
        <div>
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
            Rebuild pricing approach{" "}
            <span className="normal-case tracking-normal text-muted-2">
              · uses one refinement
            </span>
          </p>
          <div className="flex border border-rule">
            {["Subscription", "Per-session", "Hybrid"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onRegenerate(item)}
                className="flex-1 border-r border-rule px-3 py-2 font-mono text-[9px] uppercase text-muted last:border-r-0 hover:bg-accent hover:text-bg"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 items-center gap-3 border-t border-rule pt-6 font-mono text-[9px] uppercase tracking-[0.14em] sm:flex sm:flex-wrap">
        <span className="bg-accent px-4 py-3 text-bg">
          Saved to this session ✓
        </span>
        <button
          type="button"
          className="border border-rule px-4 py-3 text-fg hover:border-accent hover:text-accent"
          onClick={copyOffer}
        >
          Copy as offer
        </button>
        <Link
          className="border border-rule px-4 py-3 text-fg hover:border-accent hover:text-accent"
          href={`/tools/validation?roadmapId=${encodeURIComponent(roadmapId ?? "")}&fromPackager=${encodeURIComponent(sessionId ?? "")}`}
        >
          Send to Validation Page
        </Link>
        <span className="ml-auto text-muted">
          Available from package history
        </span>
      </div>
    </section>
  );
}

function toRoman(value: number): string {
  const numerals = ["I", "II", "III", "IV", "V", "VI"];
  return numerals[value - 1] ?? String(value);
}
