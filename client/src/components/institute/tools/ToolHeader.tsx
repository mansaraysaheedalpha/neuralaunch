// src/components/institute/tools/ToolHeader.tsx
//
// Header band shared by every tool page. Mono stamp row (Tool {roman}
// · {name} · {model} · {one-line description}), big H1 with italic-
// serif accent, and a lede paragraph beneath. Visual grammar mirrors
// the No-Idea stage header bands (PR 11/12/13).

import type { ReactNode } from 'react';

export interface ToolHeaderProps {
  /** Roman numeral for the tool (I-V across the five Execute tools). */
  roman: string;
  /** Display name in the stamp row (also the crumb tail). */
  name?: string;
  /** Mono model tag — "Opus" / "Sonnet" / "Public". */
  model: string;
  /** One-line description rendered in the stamp row. */
  description: string;
  /** H1 — ReactNode so `<em>` italic-serif accents work. */
  heading: ReactNode;
  /** Lede paragraph beneath the H1. */
  lede?: ReactNode;
}

export function ToolHeader({
  roman,
  name,
  model,
  description,
  heading,
  lede,
}: ToolHeaderProps) {
  return (
    <header className="border-b border-rule px-6 pb-7 pt-10 sm:px-12 lg:px-16">
      <div className="mb-5 flex flex-wrap gap-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        <span>
          Tool <span className="text-accent">{roman}</span>
          {name ? ` · ${name}` : ''}
        </span>
        <span className="text-accent">Model · {model}</span>
        <span>{description}</span>
      </div>
      <h1 className="font-sans text-fg [font-size:clamp(40px,5.2vw,72px)] [font-weight:500] [line-height:1] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
        {heading}
      </h1>
      {lede && (
        <p className="mt-5 max-w-[760px] text-[16px] leading-[1.55] text-fg-2 [&_em]:font-serif [&_em]:italic [&_em]:text-accent [&_strong]:font-medium [&_strong]:text-fg">
          {lede}
        </p>
      )}
    </header>
  );
}
