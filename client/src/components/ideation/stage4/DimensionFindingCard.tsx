'use client';

import { ExternalLink } from 'lucide-react';
import type { DimensionFinding } from '@/lib/ideation/stage4-opportunities/schema';
import type { LayerADimensionKey } from '@/lib/ideation/stage4-opportunities/constants';
import { LAYER_A_DIMENSION_LABELS, LAYER_A_DIMENSION_HINTS } from './labels';

export interface DimensionFindingCardProps {
  dimension: LayerADimensionKey;
  finding:   DimensionFinding | null;
}

/**
 * Single Layer A dimension card — read-only display. Pushback against
 * the agent's verdict (not the dimension's confidence) flows through
 * the per-opportunity VerdictPushbackDrawer; this card is the
 * evidence the founder reads while deciding.
 */
export function DimensionFindingCard({ dimension, finding }: DimensionFindingCardProps) {
  return (
    <article className="border border-rule bg-bg px-4 py-3.5">
      <header className="mb-2 flex flex-col gap-0.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          {LAYER_A_DIMENSION_LABELS[dimension]}
        </p>
        <p className="text-[12.5px] leading-snug text-muted">
          {LAYER_A_DIMENSION_HINTS[dimension]}
        </p>
      </header>

      {finding === null ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Not researched yet · run Layer A above.
        </p>
      ) : (
        <>
          <p className="text-[13.5px] leading-[1.55] text-fg">{finding.reasoning}</p>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Confidence · <span className="text-fg">{finding.confidence.toFixed(2)}</span>
          </div>
          {finding.citations.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {finding.citations.map((c, i) => (
                <li key={i} className="text-[12px]">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
                  >
                    <span className="truncate normal-case tracking-normal font-sans">{c.sourcePlatform}</span>
                    <ExternalLink aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                  </a>
                  {c.excerpt && (
                    <blockquote className="mt-0.5 border-l-2 border-rule pl-2 text-[12.5px] leading-snug text-muted">
                      &ldquo;{c.excerpt}&rdquo;
                    </blockquote>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}
