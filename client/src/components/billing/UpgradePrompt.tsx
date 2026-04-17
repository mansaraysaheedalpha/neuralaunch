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
      <div className="flex items-center gap-2 rounded-md border border-gold/20 bg-gold/5 px-3 py-2 text-[11px] text-gold">
        <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1">{heading ?? copy.compactHeading}</span>
        <Link
          href={href}
          className="inline-flex items-center gap-1 font-semibold text-gold underline-offset-2 hover:underline"
        >
          {primaryLabel ?? copy.primaryLabel}
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gold/30 bg-gold/5 p-5">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold">
            {requiredTier === 'compound' ? 'Compound tier' : 'Execute tier'}
          </p>
          <h3 className="mt-1 text-base font-semibold text-foreground">
            {heading ?? copy.heroHeading}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            {description ?? copy.heroDescription}
          </p>
          <Link
            href={href}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            {primaryLabel ?? copy.primaryLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
