'use client';

import type { OpportunityEvaluation, CommunityResponse } from '@/lib/ideation/stage4-opportunities/schema';
import type { AllowedScreenshotContentType } from '@/lib/ideation/stage4-opportunities/constants';
import type { OpportunityVerdict } from '@neuralaunch/constants';
import { LayerASection } from './LayerASection';
import { LayerBSection } from './LayerBSection';
import { VerdictSection } from './VerdictSection';
import type { VerdictPushbackResult } from './VerdictPushbackDrawer';

export interface OpportunityEvaluationViewProps {
  opportunity:   OpportunityEvaluation;
  responses:     CommunityResponse[];
  /** True when Layer A is currently being derived for this opportunity. */
  deriving:      boolean;
  /** True when Layer B script is currently being generated. */
  generating:    boolean;
  readOnly?:     boolean;
  // Action dispatchers — passed through from useStage4Session.
  onDeriveLayerA?:   () => Promise<void>;
  onGenerateScript?: () => Promise<void>;
  onSubmitText?:     (args: { opportunityId: string; pastedText: string }) => Promise<void>;
  onPresign?:        (input: { opportunityId: string; contentType: AllowedScreenshotContentType }) => Promise<{ uploadUrl: string; s3Key: string; s3Url: string }>;
  onSubmitImage?:    (args: { opportunityId: string; s3Key: string; s3Url: string }) => Promise<void>;
  onRemoveResponse?: (id: string) => Promise<void>;
  onPickVerdict?:    (verdict: OpportunityVerdict) => Promise<void>;
  onPushback?:       (input: { opportunityId: string; message: string; priorVersion: number }) => Promise<VerdictPushbackResult>;
}

/**
 * Expanded per-opportunity view. Composes three sections: Layer A
 * research, Layer B founder community engagement, and the verdict
 * (agent's + founder's). All action handlers are passed through from
 * the parent canvas, which owns useStage4Session.
 */
export function OpportunityEvaluationView(props: OpportunityEvaluationViewProps) {
  const {
    opportunity,
    responses,
    deriving,
    generating,
    readOnly,
    onDeriveLayerA,
    onGenerateScript,
    onSubmitText,
    onPresign,
    onSubmitImage,
    onRemoveResponse,
    onPickVerdict,
    onPushback,
  } = props;

  return (
    <div className="flex flex-col gap-6 border-t border-rule bg-bg-2 px-5 py-6">
      <LayerASection
        research={opportunity.layerAResearch}
        deriving={deriving}
        readOnly={readOnly}
        onDerive={onDeriveLayerA}
      />

      <LayerBSection
        opportunity={opportunity}
        responses={responses}
        generating={generating}
        readOnly={readOnly}
        onGenerate={onGenerateScript}
        onSubmitText={onSubmitText}
        onPresign={onPresign}
        onSubmitImage={onSubmitImage}
        onRemoveResponse={onRemoveResponse}
      />

      <VerdictSection
        opportunity={opportunity}
        readOnly={readOnly}
        onPickVerdict={onPickVerdict}
        onPushback={onPushback}
      />
    </div>
  );
}
