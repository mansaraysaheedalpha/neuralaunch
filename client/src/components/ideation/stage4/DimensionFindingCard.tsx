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
 *
 * TODO(copy): empty-state copy ("not yet researched"), citation
 * fallback label, confidence rendering — all need product-voice
 * review before launch.
 */
export function DimensionFindingCard({ dimension, finding }: DimensionFindingCardProps) {
  return (
    <article className="rounded-md border border-border bg-card/40 px-3 py-3">
      <header className="mb-2">
        <h4 className="text-sm font-semibold text-foreground">
          {LAYER_A_DIMENSION_LABELS[dimension]}
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          {LAYER_A_DIMENSION_HINTS[dimension]}
        </p>
      </header>

      {finding === null ? (
        // TODO(copy): empty-state per dimension. Generic "not researched yet"
        // is the default; the founder fires Layer A from the opportunity
        // card to populate this.
        <p className="text-xs italic text-muted-foreground">
          Not researched yet. Run Layer A on this opportunity to surface findings here.
        </p>
      ) : (
        <>
          <p className="text-sm text-foreground leading-snug">{finding.reasoning}</p>
          <div className="mt-1 text-xs text-muted-foreground">
            Confidence: <span className="font-mono text-foreground">{finding.confidence.toFixed(2)}</span>
          </div>
          {finding.citations.length > 0 && (
            <ul className="mt-2 space-y-1">
              {finding.citations.map((c, i) => (
                <li key={i} className="text-xs">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1 text-primary hover:underline"
                  >
                    <span className="truncate">{c.sourcePlatform}</span>
                    <ExternalLink className="size-3 shrink-0 mt-0.5" />
                  </a>
                  {c.excerpt && (
                    <blockquote className="mt-0.5 border-l-2 border-border pl-2 text-muted-foreground">
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
