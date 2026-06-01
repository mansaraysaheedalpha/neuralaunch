'use client';

// src/components/billing/UpgradePrompt.tsx
//
// Reusable surface that replaces a gated feature for Free-tier users.
// Two shapes: compact (inline on task cards, one-liner) and hero
// (recommendation page, multi-line with strong primary CTA).

import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';

interface UpgradePromptProps {
  /** Which tier the gated feature requires — shapes the default copy. */
  requiredTier?:       'execute' | 'compound';
  /** 'compact' renders inline; 'hero' renders as the dominant CTA block. */
  variant?:            'compact' | 'hero';
  /** Override headline copy. */
  heading?:            string;
  /** Override description copy. */
  description?:        string;
  /** Override primary button label. */
  primaryLabel?:       string;
  /** Override the link target; defaults to /#pricing. */
  href?:               string;
}

const DEFAULT_COPY = {
  execute: {
    compactHeading: 'Upgrade to Execute to unlock execution tools.',
    heroHeading:    'Ready to execute?',
    heroDescription: 'Upgrade to Execute to turn this recommendation into a roadmap with Coach, Composer, Research, and Packager unlocked on every task.',
    primaryLabel:   'Upgrade to Execute',
  },
  compound: {
    compactHeading: 'Upgrade to Compound to unlock this feature.',
    heroHeading:    'Ready to compound?',
    heroDescription: 'Upgrade to Compound for cross-session memory, voice mode, validation landing pages, and up to three concurrent ventures.',
    primaryLabel:   'Upgrade to Compound',
  },
} as const;

export function UpgradePrompt({
  requiredTier = 'execute',
  variant      = 'compact',
  heading,
  description,
  primaryLabel,
  href         = '/#pricing',
}: UpgradePromptProps) {
  const copy = DEFAULT_COPY[requiredTier];

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 border-l-2 border-accent bg-bg-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fg">
        <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-accent" />
        <span className="flex-1 normal-case tracking-normal font-sans text-[13px] text-fg-2">
          {heading ?? copy.compactHeading}
        </span>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          {primaryLabel ?? copy.primaryLabel}
          <ArrowRight aria-hidden="true" className="size-3" />
        </Link>
      </div>
    );
  }

  return (
    <section className="border-y border-rule bg-bg-2 px-6 py-10 sm:px-12">
      <div className="mb-[14px] font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        {requiredTier === 'compound' ? 'Tier · Compound' : 'Tier · Execute'}
      </div>
      <h3 className="mb-4 max-w-[640px] font-sans text-fg [font-size:clamp(22px,2.5vw,32px)] [font-weight:500] [line-height:1.1] [letter-spacing:-0.02em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
        {heading ?? copy.heroHeading}
      </h3>
      <p className="mb-7 max-w-[600px] text-[15px] leading-[1.55] text-fg-2">
        {description ?? copy.heroDescription}
      </p>
      <Link
        href={href}
        className="inline-flex items-center gap-3 bg-accent px-6 py-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5"
      >
        {primaryLabel ?? copy.primaryLabel}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </section>
  );
}
