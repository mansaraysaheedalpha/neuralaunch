'use client';
// src/components/institute/tools/ToolsLedger.tsx
//
// /tools index — Institute ledger pattern matching § 03 Toolkit on
// direction-a.html. Roman index + tool name with italic-serif accent
// + mono model tag + one-sentence description + arrow on hover.
// Replaces the prior card grid + tinted-icon-squares pattern.

import Link from 'next/link';

export interface ToolListing {
  /** Roman numeral index. */
  roman:       string;
  /** "Conversation Coach", "Outreach Composer", etc. */
  name:        string;
  /** Italic-serif accent fragment within the name (e.g. "Coach"). */
  nameAccent?: string;
  /** Mono model tag — "Opus", "Sonnet", "Public". */
  model:       string;
  /** One-sentence description in the Institute voice. */
  description: string;
  href:        string;
}

export interface ToolsLedgerProps {
  tools: ToolListing[];
}

export function ToolsLedger({ tools }: ToolsLedgerProps) {
  return (
    <div className="border-t border-rule-strong" role="list">
      {tools.map((tool) => (
        <Link
          key={tool.href}
          role="listitem"
          href={tool.href}
          className="
            group grid w-full grid-cols-[60px_1.2fr_2fr_40px] items-baseline
            gap-10 border-b border-rule px-0 py-7 transition-colors
            hover:bg-[linear-gradient(180deg,transparent,rgba(255,90,60,0.04))]
          "
        >
          <span className="font-mono text-[12px] tracking-[0.14em] text-accent">
            {tool.roman}
          </span>
          <span className="font-sans text-[clamp(22px,2.3vw,30px)] font-medium leading-[1.15] tracking-[-0.015em] text-fg">
            {tool.name}
            {tool.nameAccent && (
              <em className="font-serif italic font-normal text-accent"> {tool.nameAccent}</em>
            )}
          </span>
          <span className="text-[15px] leading-[1.5] text-fg-2">
            <span className="mr-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {tool.model}
            </span>
            {tool.description}
          </span>
          <span
            aria-hidden="true"
            className="text-right font-sans text-[24px] text-muted transition-[transform,color] duration-200 group-hover:translate-x-2 group-hover:text-accent"
          >
            →
          </span>
        </Link>
      ))}
    </div>
  );
}
