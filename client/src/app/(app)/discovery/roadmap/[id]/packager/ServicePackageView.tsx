'use client';
// src/app/(app)/discovery/roadmap/[id]/packager/ServicePackageView.tsx
//
// Renders the full ServicePackage: name, target client, included/excluded
// scope, three pricing tier cards, three revenue scenarios, and the
// formatted brief with copy-to-clipboard.

import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { ServicePackage } from '@/lib/roadmap/service-packager/schemas';

export interface ServicePackageViewProps {
  pkg: ServicePackage;
}

export function ServicePackageView({ pkg }: ServicePackageViewProps) {
  const [copied, setCopied] = useState(false);

  function handleCopyBrief() {
    void navigator.clipboard.writeText(pkg.brief).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  // Highlight the middle tier as recommended (typical Standard/middle-tier
  // anchoring pattern). When fewer than 3 tiers, no highlight.
  const recommendedTierIndex = pkg.tiers.length >= 2 ? Math.floor(pkg.tiers.length / 2) : -1;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-fg leading-tight">{pkg.serviceName}</h2>
        <p className="text-xs text-muted leading-relaxed">{pkg.targetClient}</p>
      </header>

      {/* What's included */}
      {pkg.included.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">What&apos;s included</h3>
          <ul className="flex flex-col gap-1.5">
            {pkg.included.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-fg">
                <Check className="size-3.5 text-success shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">{item.item}</span>
                  <span className="text-muted"> — {item.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What's NOT included */}
      {pkg.notIncluded.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">What&apos;s not included</h3>
          <ul className="flex flex-col gap-1">
            {pkg.notIncluded.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-muted">
                <X className="size-3 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tiers */}
      {pkg.tiers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">Pricing tiers</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {pkg.tiers.map((tier, i) => {
              const isRecommended = i === recommendedTierIndex;
              return (
                <div
                  key={i}
                  className={`rounded-lg border p-3 flex flex-col gap-2 ${
                    isRecommended
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-rule bg-bg'
                  }`}
                >
                  {isRecommended && (
                    <p className="text-[9px] uppercase tracking-widest text-accent font-semibold">Recommended</p>
                  )}
                  <p className="text-sm font-bold text-fg">{tier.displayName}</p>
                  <p className="text-base font-semibold text-fg">
                    {tier.price}
                    <span className="text-[10px] font-normal text-muted ml-1">{tier.period}</span>
                  </p>
                  <p className="text-[11px] text-muted leading-relaxed">{tier.description}</p>
                  {tier.features.length > 0 && (
                    <ul className="flex flex-col gap-0.5 mt-1">
                      {tier.features.map((f, fi) => (
                        <li key={fi} className="text-[10.5px] text-fg flex items-start gap-1">
                          <Check className="size-2.5 text-success shrink-0 mt-1" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] text-muted italic mt-1 leading-relaxed border-t border-rule pt-1.5">
                    {tier.justification}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Revenue scenarios */}
      {pkg.revenueScenarios.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">Revenue scenarios</h3>
          <div className="rounded-lg border border-rule overflow-hidden">
            {pkg.revenueScenarios.map((s, i) => (
              <div
                key={i}
                className={`px-3 py-2.5 flex flex-col gap-1 ${i > 0 ? 'border-t border-rule' : ''} ${i === 1 ? 'bg-accent/5' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold text-fg capitalize">{s.label}</p>
                  <p className="text-sm font-bold text-fg">{s.monthlyRevenue}</p>
                </div>
                <p className="text-[11px] text-muted">
                  {s.clients} client{s.clients === 1 ? '' : 's'} · {s.tierMix} · {s.weeklyHours}
                </p>
                {s.hiringNote && (
                  <p className="text-[10px] text-accent">⚠ {s.hiringNote}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Brief */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">
            Your one-page brief ({pkg.briefFormat})
          </h3>
          <button
            type="button"
            onClick={handleCopyBrief}
            className="inline-flex items-center gap-1 rounded-md border border-rule px-2.5 py-1 text-[11px] text-fg hover:bg-bg-3 transition-colors"
          >
            {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
        </div>
        <pre className="text-[11px] text-fg bg-bg border border-rule rounded-md px-3 py-3 whitespace-pre-wrap font-sans leading-relaxed">{pkg.brief}</pre>
      </section>
    </div>
  );
}
