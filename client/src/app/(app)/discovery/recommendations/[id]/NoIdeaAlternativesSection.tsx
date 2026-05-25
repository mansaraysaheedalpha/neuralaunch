'use client';
// src/app/(app)/discovery/recommendations/[id]/NoIdeaAlternativesSection.tsx
//
// Collapsible "Alternatives considered" section for the legacy
// Recommendation review surface. Closed by default per § F.6. The
// surface is suppressed entirely when reserves are empty (per § F.1).
//
// Per-card layout mirrors the pre-synthesis A.4.4 shape — the founder
// learned the card on Stage 5; reusing it here saves re-learning. Per
// § F.5 each card carries a "View in Stage 4" deep-link with a URL hash.
//
// Copy locked in docs/stage5-copy-review.md § F.

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import type { ReserveOpportunity, ReserveLayerASummary } from '@/lib/ideation/stage5-handoff/schema';
import { VERDICT_LABELS, VALIDATION_STRENGTH_LABELS } from '@/components/ideation/stage4/labels';

interface NoIdeaAlternativesSectionProps {
  reserves:          ReadonlyArray<ReserveOpportunity>;
  sessionId:         string;
  stage4StageRunId:  string | null;
}

function avgLayerAConfidence(layerA: ReserveLayerASummary | null): number | null {
  if (!layerA) return null;
  const values = [
    layerA.marketReality.confidence,
    layerA.customerAccess.confidence,
    layerA.willPeoplePay.confidence,
    layerA.marketSize.confidence,
  ];
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function agentVerdictLabel(v: ReserveOpportunity['agentVerdict']): string {
  if (v === 'pending') return 'Pending';
  if (v === 'pursue' || v === 'pursue_with_caveats' || v === 'drop') {
    return VERDICT_LABELS[v];
  }
  return v;
}

/**
 * Build a "View in Stage 4" deep-link. Routes back through the
 * dispatcher (which renders Stage 4) with a URL hash that the Stage 4
 * document view can use to scroll-to-id. The stage4StageRunId is
 * carried as a query param so the Stage 4 surface can disambiguate
 * when multiple Stage 4 rows exist on a session (rare, but defensive).
 */
function buildStage4DeepLink(sessionId: string, reserveId: string, stage4StageRunId: string | null): string {
  const base = `/discovery/no-idea/${sessionId}`;
  const params = stage4StageRunId ? `?stage4=${encodeURIComponent(stage4StageRunId)}` : '';
  return `${base}${params}#opportunity-${reserveId}`;
}

export function NoIdeaAlternativesSection({
  reserves,
  sessionId,
  stage4StageRunId,
}: NoIdeaAlternativesSectionProps) {
  const [open, setOpen] = useState<boolean>(false);

  if (reserves.length === 0) return null;

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 text-left rounded-md border border-border bg-card/30 px-3 py-2 hover:bg-card/50 transition-colors"
        aria-expanded={open}
      >
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-sm font-semibold text-foreground">
            Alternatives considered ({reserves.length})
          </span>
          {!open && (
            <span className="text-xs text-muted-foreground">
              {reserves.length} {reserves.length === 1 ? 'opportunity' : 'opportunities'} I evaluated alongside this one. Click to expand.
            </span>
          )}
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="alternatives-expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ul className="space-y-2 mt-3">
              {reserves.map(r => {
                const avg = avgLayerAConfidence(r.layerASummary);
                return (
                  <li
                    key={r.id}
                    className="rounded-md border border-border bg-card/30 px-3 py-3 text-sm"
                  >
                    <p className="text-foreground leading-snug mb-2">
                      Rank {r.rank} · {r.painPointSummary}
                    </p>
                    <dl className="grid grid-cols-[5.5rem_1fr] gap-y-0.5 text-xs text-muted-foreground">
                      <dt>Agent verdict:</dt>
                      <dd className="text-foreground">{agentVerdictLabel(r.agentVerdict)}</dd>
                      <dt>Your verdict:</dt>
                      <dd className="text-foreground">
                        {r.founderVerdict ? VERDICT_LABELS[r.founderVerdict] : 'Not set'}
                      </dd>
                      <dt>Layer A:</dt>
                      <dd className="text-foreground">
                        {avg !== null ? `avg confidence ${avg.toFixed(2)} across 4 dimensions` : 'not captured'}
                      </dd>
                      <dt>Layer B:</dt>
                      <dd className="text-foreground">
                        {r.layerBSummary
                          ? VALIDATION_STRENGTH_LABELS[r.layerBSummary.validationStrength]
                          : 'not captured'}
                      </dd>
                    </dl>
                    <a
                      href={buildStage4DeepLink(sessionId, r.id, stage4StageRunId)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      View in Stage 4
                      <ExternalLink className="size-3" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
