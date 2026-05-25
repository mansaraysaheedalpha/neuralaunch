// Server Component — pure rendering, no client state.
//
// Renders the chosen-opportunity snapshot at the top of the Stage 5
// pre-synthesis surface. Copy locked in docs/stage5-copy-review.md
// § A.3. The agentReasoning + painPointSummary strings are denormalised
// founder/agent content; the renderers in lib/ideation/stage5-handoff/
// already wrap founder-typed strings via renderUserContent before they
// land on the snapshot.

import type { ChosenOpportunitySnapshot } from '@/lib/ideation/stage5-handoff/schema';
import { VERDICT_LABELS, LAYER_A_DIMENSION_LABELS, VALIDATION_STRENGTH_LABELS } from '@/components/ideation/stage4/labels';

interface Stage5ChosenPanelProps {
  chosen: ChosenOpportunitySnapshot;
}

export function Stage5ChosenPanel({ chosen }: Stage5ChosenPanelProps) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">
        Opportunity advancing to validation
      </h2>
      <article className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-4 space-y-4">
        {/* A.3.2 Pain summary */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Pain point
          </p>
          <p className="text-sm text-foreground leading-snug">{chosen.painPointSummary}</p>
        </div>

        {/* A.3.3 Agent reasoning */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Why this one — the agent&apos;s read
          </p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
            {chosen.agentReasoning}
          </p>
        </div>

        {/* A.3.4 Founder verdict (always non-null on the chosen) */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Your verdict
          </p>
          <p className="text-sm text-foreground">
            {VERDICT_LABELS[chosen.founderVerdict]}
          </p>
        </div>

        {/* A.3.5 Layer A confidence summary */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Layer A research — 4 dimensions
          </p>
          {chosen.layerASummary ? (
            <ul className="text-xs text-muted-foreground space-y-1 mt-1">
              <li className="flex items-center gap-2">
                <span className="w-32 text-foreground">{LAYER_A_DIMENSION_LABELS.marketReality}</span>
                <span>confidence {chosen.layerASummary.marketReality.confidence.toFixed(2)}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-32 text-foreground">{LAYER_A_DIMENSION_LABELS.customerAccess}</span>
                <span>confidence {chosen.layerASummary.customerAccess.confidence.toFixed(2)}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-32 text-foreground">{LAYER_A_DIMENSION_LABELS.willPeoplePay}</span>
                <span>confidence {chosen.layerASummary.willPeoplePay.confidence.toFixed(2)}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-32 text-foreground">{LAYER_A_DIMENSION_LABELS.marketSize}</span>
                <span>confidence {chosen.layerASummary.marketSize.confidence.toFixed(2)}</span>
              </li>
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Layer A research wasn&apos;t run on this opportunity.
            </p>
          )}
        </div>

        {/* A.3.6 Layer B aggregate signal */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Layer B community engagement
          </p>
          {chosen.layerBSummary ? (
            <p className="text-xs text-muted-foreground">
              {VALIDATION_STRENGTH_LABELS[chosen.layerBSummary.validationStrength]}.
              {' '}{chosen.layerBSummary.sentimentBreakdown.positive} positive ·
              {' '}{chosen.layerBSummary.sentimentBreakdown.neutral} neutral ·
              {' '}{chosen.layerBSummary.sentimentBreakdown.negative} negative.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No community responses were captured.
            </p>
          )}
        </div>
      </article>
    </section>
  );
}
