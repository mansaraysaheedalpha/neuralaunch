// Server Component — pure rendering, no client state.
//
// Renders the "Alternatives considered" panel on the Stage 5
// pre-synthesis surface. Copy locked in docs/stage5-copy-review.md
// § A.4. The reserves section is read-only — per-card drill-down is
// suppressed in the pre-synthesis context; the page-level "Revisit
// Stage 4" link (Stage5CtaBlock) is the single drill affordance.

import type { ReserveOpportunity, ReserveLayerASummary } from '@/lib/ideation/stage5-handoff/schema';
import { VERDICT_LABELS, VALIDATION_STRENGTH_LABELS } from '@/components/ideation/stage4/labels';

interface Stage5ReservesListProps {
  reserves: ReadonlyArray<ReserveOpportunity>;
}

/** Average the four Layer A confidence numbers into one glanceable value. */
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

/** Agent verdict label — handles 'pending' (synthesizer hasn't fired). */
function agentVerdictLabel(v: ReserveOpportunity['agentVerdict']): string {
  if (v === 'pending') return 'Pending';
  // The ReserveOpportunity.agentVerdict schema includes 'pending' beyond
  // the canonical enum — narrow safely.
  if (v === 'pursue' || v === 'pursue_with_caveats' || v === 'drop') {
    return VERDICT_LABELS[v];
  }
  return v;
}

export function Stage5ReservesList({ reserves }: Stage5ReservesListProps) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-1">
        Alternatives considered ({reserves.length})
      </h2>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        What I evaluated alongside the chosen opportunity. These stay with your handoff in case you fork later.
      </p>

      {reserves.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No alternatives — only one opportunity survived Stage 4&apos;s shortlist.
        </p>
      ) : (
        <ul className="space-y-2">
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
                    {avg !== null
                      ? `avg confidence ${avg.toFixed(2)} across 4 dimensions`
                      : 'not captured'}
                  </dd>

                  <dt>Layer B:</dt>
                  <dd className="text-foreground">
                    {r.layerBSummary
                      ? VALIDATION_STRENGTH_LABELS[r.layerBSummary.validationStrength]
                      : 'not captured'}
                  </dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
