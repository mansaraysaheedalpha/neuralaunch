'use client';

import { useState } from 'react';
import type { Stage4AuthoringState } from '@/lib/ideation/stage4-opportunities/schema';
import type { AllowedScreenshotContentType } from '@/lib/ideation/stage4-opportunities/constants';
import { MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT } from '@/lib/ideation/stage4-opportunities/constants';
import type { OpportunityVerdict } from '@neuralaunch/constants';
import { OpportunityCard } from './OpportunityCard';
import { OpportunityEvaluationView } from './OpportunityEvaluationView';
import type { VerdictPushbackResult } from './VerdictPushbackDrawer';

export interface OpportunityInventoryCanvasProps {
  state:    Stage4AuthoringState;
  readOnly?: boolean;
  /** Per-opportunity action dispatchers wired up by useStage4Session. */
  deriveLayerA:    (opportunityId: string) => Promise<void>;
  generateScript:  (opportunityId: string) => Promise<void>;
  submitText:      (args: { opportunityId: string; pastedText: string }) => Promise<void>;
  presign:         (input: { opportunityId: string; contentType: AllowedScreenshotContentType }) => Promise<{ uploadUrl: string; s3Key: string; s3Url: string }>;
  submitImage:     (args: { opportunityId: string; s3Key: string; s3Url: string }) => Promise<void>;
  removeResponse:  (id: string) => Promise<void>;
  pickVerdict:     (opportunityId: string, verdict: OpportunityVerdict) => Promise<void>;
  pushback:        (input: { opportunityId: string; message: string; priorVersion: number }) => Promise<VerdictPushbackResult>;
  /** Per-opportunity flags so each card knows when its action is in-flight. */
  derivingFor:    string | null;
  generatingFor:  string | null;
}

/**
 * Stage 4 canvas — orchestrates the per-opportunity rows. Founder
 * opens one OpportunityCard at a time to view full Layer A / B /
 * verdict surfaces. Readiness row at top shows the
 * compose-unlocks-at-1 contract.
 *
 * TODO(copy): cascade banner, readiness row text, empty-state when
 * no opportunities yet — all need product-voice review.
 */
export function OpportunityInventoryCanvas({
  state,
  readOnly,
  deriveLayerA,
  generateScript,
  submitText,
  presign,
  submitImage,
  removeResponse,
  pickVerdict,
  pushback,
  derivingFor,
  generatingFor,
}: OpportunityInventoryCanvasProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const ratedCount = state.opportunities.filter(
    o => o.status === 'evaluated' && o.founderVerdict !== null && o.founderVerdict !== 'drop',
  ).length;

  return (
    <div className="space-y-4">
      {state.requiresRederivation && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 px-3 py-2 text-xs text-foreground">
          {/* TODO(copy): cascade banner */}
          You updated Stage 1, 2, or 3 — the evaluations below are based on what you had before. Re-run Layer A on each opportunity, or commit again to start fresh.
        </div>
      )}

      <ReadinessRow ratedCount={ratedCount} />

      {state.opportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          {/* TODO(copy): empty-state when Stage 3 didn't seed opps yet */}
          No opportunities to evaluate yet. This usually means Stage 3 hasn&apos;t committed.
        </div>
      ) : (
        <ul className="space-y-3">
          {state.opportunities.map(o => {
            const expanded  = expandedId === o.id;
            const responses = state.founderCommunityResponses.filter(r => r.opportunityId === o.id);
            return (
              <li key={o.id}>
                <OpportunityCard
                  opportunity={o}
                  expanded={expanded}
                  onToggle={() => setExpandedId(expanded ? null : o.id)}
                />
                {expanded && (
                  <OpportunityEvaluationView
                    opportunity={o}
                    responses={responses}
                    deriving={derivingFor === o.id}
                    generating={generatingFor === o.id}
                    readOnly={readOnly}
                    onDeriveLayerA={() => deriveLayerA(o.id)}
                    onGenerateScript={() => generateScript(o.id)}
                    onSubmitText={submitText}
                    onPresign={presign}
                    onSubmitImage={submitImage}
                    onRemoveResponse={removeResponse}
                    onPickVerdict={(v) => pickVerdict(o.id, v)}
                    onPushback={pushback}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface ReadinessRowProps { ratedCount: number }

function ReadinessRow({ ratedCount }: ReadinessRowProps) {
  const ready = ratedCount >= MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT;
  const cls = ready
    ? 'border-success/30 bg-success/5 text-foreground'
    : 'border-border bg-card/30 text-muted-foreground';
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${cls}`} role="status">
      {ready ? (
        // TODO(copy): ready-to-compose phrasing
        <>You have <span className="font-mono text-foreground">{ratedCount}</span> opportunities with a verdict — ready to compose.</>
      ) : (
        // TODO(copy): not-yet-ready phrasing
        <>
          You have <span className="font-mono text-foreground">{ratedCount}</span> verdicts.
          Compose unlocks at <span className="font-mono text-foreground">{MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT}</span>.
        </>
      )}
    </div>
  );
}
