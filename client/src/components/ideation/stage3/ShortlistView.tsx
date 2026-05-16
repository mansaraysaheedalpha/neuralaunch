'use client';

import { ExternalLink } from 'lucide-react';
import type { PainInventoryDocument, PainPoint } from '@/lib/ideation/stage3-opportunities/schema';
import { FOUNDER_CONTEXT_LABELS } from './labels';

export interface ShortlistViewProps {
  document: PainInventoryDocument;
}

/**
 * Renders the shortlist + the full inventory snapshot + the rulesOut
 * paragraph. Read-only — review-mode only. The chat surface owns the
 * "edit / rate / push back" affordances.
 */
export function ShortlistView({ document: doc }: ShortlistViewProps) {
  const byId = new Map(doc.painPointsSnapshot.map(p => [p.id, p]));
  const shortlist = doc.shortlist
    .map(id => byId.get(id))
    .filter((p): p is PainPoint => p !== undefined);
  const rejected = doc.painPointsSnapshot.filter(p => !doc.shortlist.includes(p.id));

  return (
    <div className="space-y-6">
      <section>
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            Shortlist <span className="text-muted-foreground">({shortlist.length} of up to {doc.shortlistCap})</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ranked by combined score (intensity × frequency × niche). Stage 4 will deepen each.
          </p>
        </header>
        <ol className="space-y-3">
          {shortlist.map((p, i) => (
            <li key={p.id} className="rounded-lg border border-border bg-card/30 px-3 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-mono text-primary">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <PainPointSummary painPoint={p} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-2">Why these and not the others</h2>
        <p className="text-sm text-foreground leading-relaxed">
          {doc.rulesOut.length > 0 ? doc.rulesOut : (
            <span className="text-muted-foreground">No exclusions written.</span>
          )}
        </p>
      </section>

      {rejected.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">
            Considered but not shortlisted <span className="text-muted-foreground">({rejected.length})</span>
          </h2>
          <ul className="space-y-2">
            {rejected.map(p => (
              <li key={p.id} className="rounded-md border border-border bg-card/20 px-3 py-2 text-sm">
                <PainPointSummary painPoint={p} compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline summary — compact and full variants share most of the body
// ---------------------------------------------------------------------------

interface PainPointSummaryProps {
  painPoint: PainPoint;
  compact?:  boolean;
}

function PainPointSummary({ painPoint, compact }: PainPointSummaryProps) {
  const isFounder = painPoint.source === 'founder';
  const scoreLabel = painPoint.combinedScore !== null
    ? `combined ${painPoint.combinedScore}`
    : 'unrated';
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium uppercase tracking-wider">
          {isFounder ? 'You added' : 'Agent surfaced'}
        </span>
        {isFounder && painPoint.founderContext && (
          <span>{FOUNDER_CONTEXT_LABELS[painPoint.founderContext]}</span>
        )}
        {!isFounder && painPoint.communityOrigin && (
          <span>{painPoint.communityOrigin}</span>
        )}
        <span className="font-mono">· {scoreLabel}</span>
      </div>
      <p className="text-sm text-foreground leading-snug">{painPoint.description}</p>
      {!compact && !isFounder && painPoint.evidenceExcerpt && (
        <blockquote className="mt-1.5 border-l-2 border-border pl-2 text-xs text-muted-foreground">
          &ldquo;{painPoint.evidenceExcerpt}&rdquo;
          {painPoint.evidenceUrl && (
            <a
              href={painPoint.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              source <ExternalLink className="size-3" />
            </a>
          )}
        </blockquote>
      )}
      {!compact && isFounder && painPoint.founderNotes && (
        <p className="mt-1 text-xs text-muted-foreground italic">{painPoint.founderNotes}</p>
      )}
    </div>
  );
}
