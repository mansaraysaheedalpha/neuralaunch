'use client';

import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import type { OpportunityEvaluation } from '@/lib/ideation/stage4-opportunities/schema';
import type { OpportunityVerdict } from '@neuralaunch/constants';
import {
  VERDICT_SHORT_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  VALIDATION_STRENGTH_LABELS,
} from './labels';

/** Type-safe verdict label — handles the 'pending' state that
 *  OpportunityEvaluation.agentVerdict carries before synthesis fires. */
function agentVerdictLabel(v: OpportunityEvaluation['agentVerdict']): string {
  if (v === 'pending') return 'pending';
  return VERDICT_SHORT_LABELS[v as OpportunityVerdict];
}

export interface OpportunityCardProps {
  opportunity:  OpportunityEvaluation;
  expanded:     boolean;
  onToggle:     () => void;
}

/**
 * Collapsed-row representation of one opportunity. Shows pain summary
 * + agent verdict + founder verdict + Layer A/B at-a-glance indicators.
 * Click expands into OpportunityEvaluationView. Used as the canvas
 * primary row; founders open one opportunity at a time.
 */
export function OpportunityCard({ opportunity, expanded, onToggle }: OpportunityCardProps) {
  const layerA = opportunity.layerAResearch !== null;
  const layerB = opportunity.layerBExtractedSignal?.validationStrength ?? null;
  const founderVerdict = opportunity.founderVerdict;

  return (
    <article className={`rounded-lg border bg-card/40 ${expanded ? 'border-primary/40' : 'border-border'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-3 text-left hover:bg-card/60 rounded-lg"
        aria-expanded={expanded}
      >
        <span className="mt-0.5 text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium uppercase tracking-wider">
              {OPPORTUNITY_STATUS_LABELS[opportunity.status]}
            </span>
            <span>{layerA ? 'A✓' : 'A·'}</span>
            <span>{layerB ? `B ${VALIDATION_STRENGTH_LABELS[layerB]}` : 'B·'}</span>
            <span>·</span>
            <span>
              Agent: {agentVerdictLabel(opportunity.agentVerdict)}
              <span className="mx-1">·</span>
              You: {founderVerdict ? VERDICT_SHORT_LABELS[founderVerdict] : '—'}
            </span>
            {opportunity.layerBExtractedSignal?.validationStrength === 'contradictory' && (
              <AlertCircle className="size-3 text-amber-500" />
            )}
          </div>
          <p className="text-sm text-foreground leading-snug">{opportunity.painPointSummary}</p>
        </div>
      </button>
    </article>
  );
}
